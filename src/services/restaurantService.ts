import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { logAction } from "./auditLogService";

// ----------------------------------------------------------------
// Create restaurant (DONOR only)
// ----------------------------------------------------------------
export async function createRestaurant(
  ownerId: string,
  data: {
    name: string;
    address: string;
    locationLat: number;
    locationLng: number;
    closingTime: string;
  }
) {
  const restaurant = await prisma.restaurant.create({
    data: {
      name: data.name,
      address: data.address,
      locationLat: data.locationLat,
      locationLng: data.locationLng,
      closingTime: data.closingTime,
      ownerId,
    },
  });

  return restaurant;
}

// ----------------------------------------------------------------
// List approved restaurants with cursor pagination
// ----------------------------------------------------------------
export async function listRestaurants(cursor?: string, limit = 10) {
  const take = Math.min(limit, 50);

  const restaurants = await prisma.restaurant.findMany({
    where: { isApproved: true },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      address: true,
      locationLat: true,
      locationLng: true,
      closingTime: true,
      rating: true,
      createdAt: true,
    },
  });

  const hasMore = restaurants.length > take;
  const data = hasMore ? restaurants.slice(0, take) : restaurants;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, meta: { nextCursor, hasMore } };
}

// ----------------------------------------------------------------
// Get single restaurant by ID
// ----------------------------------------------------------------
export async function getRestaurantById(id: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      ratings: { select: { score: true } },
    },
  });

  if (!restaurant) throw new AppError("Restaurant not found", 404);
  return restaurant;
}

// ----------------------------------------------------------------
// Approve restaurant (ADMIN only)
// ----------------------------------------------------------------
export async function approveRestaurant(restaurantId: string, adminId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
  });
  if (!restaurant) throw new AppError("Restaurant not found", 404);

  const updated = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { isApproved: true },
  });

  await logAction({
    actorId: adminId,
    action: "APPROVE_RESTAURANT",
    targetType: "Restaurant",
    targetId: restaurantId,
  });

  return updated;
}

// ----------------------------------------------------------------
// Block restaurant (ADMIN only)
// ----------------------------------------------------------------
export async function blockRestaurant(restaurantId: string, adminId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
  });
  if (!restaurant) throw new AppError("Restaurant not found", 404);

  const updated = await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { isApproved: false },
  });

  await logAction({
    actorId: adminId,
    action: "BLOCK_RESTAURANT",
    targetType: "Restaurant",
    targetId: restaurantId,
  });

  return updated;
}