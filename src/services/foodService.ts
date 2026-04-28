import { Allergen, FoodStatus, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { assertTransition } from "./foodStateMachine";
import { NotFoundError, ForbiddenError } from "../utils/errors";

export const createFoodBagSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  originalPriceCents: z.number().int().positive(),
  quantity: z.number().int().positive().default(1),
  pickupDeadline: z.string().datetime(),
  allergens: z.array(z.nativeEnum(Allergen)).optional().default([]),
});

export type CreateFoodBagInput = z.infer<typeof createFoodBagSchema>;

export async function createFoodBag(input: CreateFoodBagInput) {
  const { allergens, ...rest } = input;

  return prisma.foodBag.create({
    data: {
      ...rest,
      currentPriceCents: rest.originalPriceCents,
      pickupDeadline: new Date(rest.pickupDeadline),
      publishedAt: new Date(),
      allergens: {
        create: allergens.map((allergen) => ({ allergen })),
      },
    },
    include: { allergens: true },
  });
}

export interface ListFoodBagsOptions {
  cursor?: string;
  limit?: number;
  excludeAllergens?: Allergen[];
  status?: FoodStatus;
}

export async function listFoodBags(options: ListFoodBagsOptions = {}) {
  const { cursor, limit = 20, excludeAllergens = [], status } = options;

  const bags = await prisma.foodBag.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where: {
      ...(status ? { status } : { status: { not: FoodStatus.COMPOST } }),
      ...(excludeAllergens.length > 0
        ? {
            allergens: {
              none: { allergen: { in: excludeAllergens } },
            },
          }
        : {}),
      pickupDeadline: { gt: new Date() },
    },
    orderBy: { pickupDeadline: "asc" },
    include: { allergens: true },
  });

  const hasMore = bags.length > limit;
  const items = hasMore ? bags.slice(0, limit) : bags;

  return {
    items,
    meta: {
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    },
  };
}

export async function getFoodBag(id: string) {
  const bag = await prisma.foodBag.findUnique({
    where: { id },
    include: { allergens: true },
  });
  if (!bag) throw new NotFoundError("Food bag not found");
  return bag;
}

export async function updateFoodStatus(
  id: string,
  newStatus: FoodStatus,
  userId: string,
  userRole: Role
) {
  const bag = await prisma.foodBag.findUnique({ where: { id } });
  if (!bag) throw new NotFoundError("Food bag not found");

  if (userRole !== Role.ADMIN) {
    throw new ForbiddenError("Only admins can change food bag status");
  }

  assertTransition(bag.status, newStatus);

  return prisma.foodBag.update({
    where: { id },
    data: { status: newStatus },
    include: { allergens: true },
  });
}
