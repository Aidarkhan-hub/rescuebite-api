import { Request, Response } from "express";
import { z } from "zod";
import * as driverService from "../services/driverService";
import { asyncHandler } from "../utils/asyncHandler";

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const listAvailableOrders = asyncHandler(
  async (req: Request, res: Response) => {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    const result = await driverService.listAvailableOrders(cursor, limit);
    res.json({ success: true, ...result });
  }
);

export const acceptOrder = asyncHandler(
  async (req: Request, res: Response) => {
    const order = await driverService.acceptOrder(
      req.params.id as string,
      req.user!.sub
    );
    res.json({ success: true, data: order });
  }
);

export const updateLocation = asyncHandler(
  async (req: Request, res: Response) => {
    const { lat, lng } = locationSchema.parse(req.body);
    const result = await driverService.updateDriverLocation(
      req.params.id as string,
      req.user!.sub,
      lat,
      lng
    );
    res.json({ success: true, data: result });
  }
);

export const getHistory = asyncHandler(
  async (req: Request, res: Response) => {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    const result = await driverService.getDriverHistory(
      req.user!.sub,
      cursor,
      limit
    );
    res.json({ success: true, ...result });
  }
);