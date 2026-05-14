import { Request, Response } from "express";
import { z } from "zod";
import * as auctionService from "../services/auctionService";
import { asyncHandler } from "../utils/asyncHandler";

const bidSchema = z.object({
  bidAmount: z.number().int().positive(),
});

export const listActiveAuctions = asyncHandler(
  async (req: Request, res: Response) => {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    const result = await auctionService.listActiveAuctions(cursor, limit);
    res.json({ success: true, ...result });
  }
);

export const placeBid = asyncHandler(async (req: Request, res: Response) => {
  const { bidAmount } = bidSchema.parse(req.body);
  const bid = await auctionService.placeBid(
    req.params.id as string,
    req.user!.sub,
    bidAmount
  );
  res.status(201).json({ success: true, data: bid });
});

export const closeAuction = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await auctionService.closeAuction(req.params.id as string);
    res.json({ success: true, data: result });
  }
);