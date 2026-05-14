import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { FoodStatus, ReservationStatus } from "@prisma/client";
import { BadRequestError, NotFoundError, ConflictError } from "../utils/errors";
import { enqueueReservationConfirmation } from "../config/queue";

const LOCK_TTL_SECONDS = 30;
const RESERVATION_TTL_SECONDS = 300; // 5 min to complete checkout

function lockKey(foodBagId: string): string {
  return `lock:${foodBagId}`;
}

async function acquireLock(foodBagId: string, requestId: string): Promise<boolean> {
  const result = await redis.set(lockKey(foodBagId), requestId, "EX", LOCK_TTL_SECONDS, "NX");
  return result === "OK";
}

async function releaseLock(foodBagId: string, requestId: string): Promise<void> {
  const current = await redis.get(lockKey(foodBagId));
  if (current === requestId) await redis.del(lockKey(foodBagId));
}

export interface ReserveInput {
  foodBagId: string;
  userId: string;
  quantity?: number;
}

export interface ReserveResult {
  reservationId: string;
  pricePaidCents: number;
  expiresInSeconds: number;
}

export async function reserveStock(input: ReserveInput): Promise<ReserveResult> {
  const { foodBagId, userId, quantity = 1 } = input;
  const requestId = `${userId}:${Date.now()}`;

  const locked = await acquireLock(foodBagId, requestId);
  if (!locked) {
    throw new ConflictError("Item is currently being purchased by another user. Try again.");
  }

  try {
    const foodBag = await prisma.foodBag.findUnique({ where: { id: foodBagId } });
    if (!foodBag) throw new NotFoundError("Food bag not found");
    if (foodBag.status === FoodStatus.COMPOST) throw new BadRequestError("This food bag has expired");
    if (foodBag.quantity < quantity) {
      throw new ConflictError(`Insufficient stock. Available: ${foodBag.quantity}, requested: ${quantity}`);
    }
    if (foodBag.pickupDeadline < new Date()) throw new BadRequestError("Pickup deadline has passed");

    const reservation = await prisma.$transaction(async (tx) => {
      const updated = await tx.foodBag.update({
        where: { id: foodBagId },
        data: { quantity: { decrement: quantity } },
      });
      if (updated.quantity < 0) throw new ConflictError("Race condition: insufficient stock");

      return tx.reservation.create({
        data: {
          foodBagId,
          userId,
          pricePaidCents: foodBag.currentPriceCents * quantity,
          status: ReservationStatus.PENDING,
        },
      });
    });

    await redis.setex(
      `reservation:${reservation.id}`,
      RESERVATION_TTL_SECONDS,
      JSON.stringify({ foodBagId, userId, quantity })
    );

    // Send confirmation email async — does not block the API response
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (user) {
      await enqueueReservationConfirmation({
        to: user.email,
        name: user.name,
        bagTitle: foodBag.title,
        pricePaidCents: reservation.pricePaidCents,
        pickupDeadline: foodBag.pickupDeadline.toISOString(),
      });
    }

    return {
      reservationId: reservation.id,
      pricePaidCents: reservation.pricePaidCents,
      expiresInSeconds: RESERVATION_TTL_SECONDS,
    };
  } finally {
    await releaseLock(foodBagId, requestId);
  }
}

export async function cancelReservation(reservationId: string, userId: string): Promise<void> {
  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw new NotFoundError("Reservation not found");
  if (reservation.userId !== userId) throw new BadRequestError("Not your reservation");
  if (reservation.status !== ReservationStatus.PENDING) {
    throw new BadRequestError("Only PENDING reservations can be cancelled");
  }

  await prisma.$transaction([
    prisma.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.CANCELLED },
    }),
    prisma.foodBag.update({
      where: { id: reservation.foodBagId },
      data: { quantity: { increment: 1 } },
    }),
  ]);

  await redis.del(`reservation:${reservationId}`);
}