import { Request, Response } from "express";
import { z } from "zod";
import { Allergen, FoodStatus, Role } from "@prisma/client";
import * as foodService from "../services/foodService";
import { validateAllergenInput, parseAllergens } from "../services/allergenService";
import * as reservationService from "../services/reservationService";
import { asyncHandler } from "../utils/asyncHandler";

export const createFoodBag = asyncHandler(async (req: Request, res: Response) => {
  const body = foodService.createFoodBagSchema.parse(req.body);
  const bag = await foodService.createFoodBag(body);
  res.status(201).json({ success: true, data: bag });
});

export const listFoodBags = asyncHandler(async (req: Request, res: Response) => {
  const cursor = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 100);
  const status = req.query.status as FoodStatus | undefined;

  let excludeAllergens: Allergen[] = [];
  if (req.user) {
    const { prisma } = await import("../config/prisma");
    const exclusions = await prisma.userAllergenExclusion.findMany({
      where: { userId: req.user.sub },
    });
    excludeAllergens = exclusions.map((e) => e.allergen);
  }

  const result = await foodService.listFoodBags({ cursor, limit, excludeAllergens, status });
  res.status(200).json({ success: true, ...result });
});

export const getFoodBag = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const bag = await foodService.getFoodBag(id);
  res.status(200).json({ success: true, data: bag });
});

export const updateFoodStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = z.object({ status: z.nativeEnum(FoodStatus) }).parse(req.body);
  const id = req.params.id as string;
  const bag = await foodService.updateFoodStatus(id, status, req.user!.sub, req.user!.role as Role);
  res.status(200).json({ success: true, data: bag });
});

export const parseAllergensHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = validateAllergenInput(req.body);

  if (req.user && !req.body.userAllergens) {
    const { prisma } = await import("../config/prisma");
    const exclusions = await prisma.userAllergenExclusion.findMany({
      where: { userId: req.user.sub },
    });
    input.userAllergens = exclusions.map((e) => e.allergen);
  }

  const result = parseAllergens(input);
  res.status(200).json({ success: true, data: result });
});

export const reserveFoodBag = asyncHandler(async (req: Request, res: Response) => {
  const { quantity } = z
    .object({ quantity: z.number().int().positive().default(1) })
    .parse(req.body);

  const result = await reservationService.reserveStock({
    foodBagId: req.params.id as string,
    userId: req.user!.sub,
    quantity,
  });
  res.status(201).json({ success: true, data: result });
});

export const cancelReservation = asyncHandler(async (req: Request, res: Response) => {
  await reservationService.cancelReservation(
    req.params.reservationId as string,
    req.user!.sub
  );
  res.status(200).json({ success: true, message: "Reservation cancelled" });
});
