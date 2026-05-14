import { Request, Response } from "express";
import { z } from "zod";
import * as restaurantService from "../services/restaurantService";
import * as ratingService from "../services/ratingService";
import { asyncHandler } from "../utils/asyncHandler";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  locationLat: z.number().min(-90).max(90),
  locationLng: z.number().min(-180).max(180),
  closingTime: z.string().regex(/^\d{2}:\d{2}$/, "Format must be HH:MM"),
});

const rateSchema = z.object({
  score: z.number().int().min(1).max(5),
});

export const createRestaurant = asyncHandler(
  async (req: Request, res: Response) => {
    const body = createSchema.parse(req.body);
    const ownerId = req.user!.sub;
    const restaurant = await restaurantService.createRestaurant(ownerId, body);
    res.status(201).json({ success: true, data: restaurant });
  }
);

export const listRestaurants = asyncHandler(
  async (req: Request, res: Response) => {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    const result = await restaurantService.listRestaurants(cursor, limit);
    res.json({ success: true, ...result });
  }
);

export const getRestaurant = asyncHandler(
  async (req: Request, res: Response) => {
    const restaurant = await restaurantService.getRestaurantById(
      req.params.id as string
    );
    res.json({ success: true, data: restaurant });
  }
);

export const approveRestaurant = asyncHandler(
  async (req: Request, res: Response) => {
    const restaurant = await restaurantService.approveRestaurant(
      req.params.id as string,
      req.user!.sub
    );
    res.json({ success: true, data: restaurant });
  }
);

export const blockRestaurant = asyncHandler(
  async (req: Request, res: Response) => {
    const restaurant = await restaurantService.blockRestaurant(
      req.params.id as string,
      req.user!.sub
    );
    res.json({ success: true, data: restaurant });
  }
);

export const rateRestaurant = asyncHandler(
  async (req: Request, res: Response) => {
    const { score } = rateSchema.parse(req.body);
    const rating = await ratingService.rateRestaurant(
      req.user!.sub,
      req.params.id as string,
      score
    );
    res.status(201).json({ success: true, data: rating });
  }
);