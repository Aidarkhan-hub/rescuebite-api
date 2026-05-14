import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { emailQueue } from "../config/queue";
import { asyncHandler } from "../utils/asyncHandler";
import { NotFoundError } from "../utils/errors";

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip  = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, email: true, name: true, role: true,
        isActive: true, isEmailVerified: true, createdAt: true,
      },
    }),
    prisma.user.count(),
  ]);

  res.json({
    success: true,
    data: { users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
});

export const toggleUserActive = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("User not found");

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: !user.isActive },
    select: { id: true, email: true, isActive: true },
  });

  res.json({ success: true, data: updated });
});

export const listAllFoodBags = asyncHandler(async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const skip  = (page - 1) * limit;

  const [bags, total] = await Promise.all([
    prisma.foodBag.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { allergens: true, _count: { select: { reservations: true } } },
    }),
    prisma.foodBag.count(),
  ]);

  res.json({
    success: true,
    data: { bags, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
});

export const getQueueStats = asyncHandler(async (_req: Request, res: Response) => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    emailQueue.getWaitingCount(),
    emailQueue.getActiveCount(),
    emailQueue.getCompletedCount(),
    emailQueue.getFailedCount(),
    emailQueue.getDelayedCount(),
  ]);

  res.json({
    success: true,
    data: { queue: "email", waiting, active, completed, failed, delayed },
  });
});