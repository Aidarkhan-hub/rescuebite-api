import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";
import { haversineDistance } from "../utils/haversine";

const GEOFENCE_RADIUS_METERS = 100;

// ----------------------------------------------------------------
// List available orders for drivers (PENDING status)
// ----------------------------------------------------------------
export async function listAvailableOrders(cursor?: string, limit = 10) {
  const take = Math.min(limit, 50);

  const orders = await prisma.order.findMany({
    where: { status: "PENDING", driverId: null },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "asc" },
    include: {
      driver: { select: { id: true, name: true } },
    },
  });

  const hasMore = orders.length > take;
  const data = hasMore ? orders.slice(0, take) : orders;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, meta: { nextCursor, hasMore } };
}

// ----------------------------------------------------------------
// Accept an order (DRIVER only)
// ----------------------------------------------------------------
export async function acceptOrder(orderId: string, driverId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404);
  if (order.status !== "PENDING") {
    throw new AppError("Order is no longer available", 409);
  }
  if (order.driverId !== null) {
    throw new AppError("Order already taken by another driver", 409);
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { driverId, status: "IN_PROGRESS" },
  });

  return updated;
}

// ----------------------------------------------------------------
// Update GPS location — auto-complete if within 100m of destination
// ----------------------------------------------------------------
export async function updateDriverLocation(
  orderId: string,
  driverId: string,
  lat: number,
  lng: number
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404);
  if (order.driverId !== driverId) {
    throw new AppError("This is not your order", 403);
  }
  if (order.status !== "IN_PROGRESS") {
    throw new AppError("Order is not in progress", 400);
  }

  // Check geofence if destination is set
  if (order.deliveryLat !== null && order.deliveryLng !== null) {
    const distance = haversineDistance(
      lat,
      lng,
      order.deliveryLat,
      order.deliveryLng
    );

    if (distance <= GEOFENCE_RADIUS_METERS) {
      // Driver arrived — mark as COMPLETED
      const completed = await prisma.order.update({
        where: { id: orderId },
        data: { status: "COMPLETED" },
      });
      return { order: completed, arrived: true, distanceMeters: distance };
    }
  }

  return { order, arrived: false };
}

// ----------------------------------------------------------------
// Get driver's delivery history
// ----------------------------------------------------------------
export async function getDriverHistory(driverId: string, cursor?: string, limit = 10) {
  const take = Math.min(limit, 50);

  const orders = await prisma.order.findMany({
    where: { driverId, status: { in: ["COMPLETED", "CANCELLED"] } },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { updatedAt: "desc" },
  });

  const hasMore = orders.length > take;
  const data = hasMore ? orders.slice(0, take) : orders;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, meta: { nextCursor, hasMore } };
}