import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { FoodStatus } from "@prisma/client";
import { BadRequestError, NotFoundError, ConflictError } from "../utils/errors";

const LOCK_TTL_SECONDS = 30;
const RESERVATION_TTL_SECONDS = 300; // 5 min to complete checkout

function stockKey(foodBagId: string): string {
  return `stock:${foodBagId}`;
}

function lockKey(foodBagId: string): string {
  return `lock:${foodBagId}`;
}

/**
 * Acquire a Redis distributed lock for a food bag.
 * Returns true if lock acquired, false otherwise.
 */
async function acquireLock(foodBagId: string, requestId: string): Promise<boolean> {
  const key = lockKey(foodBagId);
  const result = await redis.set(key, requestId, "EX", LOCK_TTL_SECONDS, "NX");
  return result === "OK";
}

async function releaseLock(foodBagId: string, requestId: string): Promise<void> {
  const key = lockKey(foodBagId);
  const current = await redis.get(key);
  if (current === requestId) {
    await redis.del(key);
  }
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

/**
 * Atomically reserve stock using Redis lock + DB transaction.
 */
export async function reserveStock(input: ReserveInput): Promise<ReserveResult> {
  const { foodBagId, userId, quantity = 1 } = input;
  const requestId = `${userId}:${Date.now()}`;

  const locked = await acquireLock(foodBagId, requestId);
  if (!locked) {
    throw new ConflictError("Item is currently being purchased by another user. Try again.");
  }

  try {
    const foodBag = await prisma.foodBag.findUnique({
      where: { id: foodBagId },
    });

    if (!foodBag) throw new NotFoundError("Food bag not found");

    if (foodBag.status === FoodStatus.COMPOST) {
      throw new BadRequestError("This food bag has expired");
    }

    if (foodBag.quantity < quantity) {
      throw new ConflictError(
        `Insufficient stock. Available: ${foodBag.quantity}, requested: ${quantity}`
      );
    }

    if (foodBag.pickupDeadline < new Date()) {
      throw new BadRequestError("Pickup deadline has passed");
    }

    // Create reservation + decrement quantity atomically
    const reservation = await prisma.$transaction(async (tx) => {
      const updated = await tx.foodBag.update({
        where: { id: foodBagId },
        data: { quantity: { decrement: quantity } },
      });

      if (updated.quantity < 0) {
        throw new ConflictError("Race condition: insufficient stock");
      }

      return tx.reservation.create({
        data: {
          foodBagId,
          userId,
          pricePaidCents: foodBag.currentPriceCents * quantity,
          status: "PENDING",
        },
      });
    });

    // Cache reservation in Redis with TTL
    await redis.setex(
      `reservation:${reservation.id}`,
      RESERVATION_TTL_SECONDS,
      JSON.stringify({ foodBagId, userId, quantity })
    );

    return {
      reservationId: reservation.id,
      pricePaidCents: reservation.pricePaidCents,
      expiresInSeconds: RESERVATION_TTL_SECONDS,
    };
  } finally {
    await releaseLock(foodBagId, requestId);
  }
}

export async function cancelReservation(
  reservationId: string,
  userId: string
): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
  });

  if (!reservation) throw new NotFoundError("Reservation not found");
  if (reservation.userId !== userId) {
    throw new BadRequestError("Not your reservation");
  }
  if (reservation.status !== "PENDING") {
    throw new BadRequestError("Only PENDING reservations can be cancelled");
  }

  await prisma.$transaction([
    prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "CANCELLED" },
    }),
    prisma.foodBag.update({
      where: { id: reservation.foodBagId },
      data: { quantity: { increment: 1 } },
    }),
  ]);

  await redis.del(`reservation:${reservationId}`);
}
