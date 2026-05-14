import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";

const AUCTION_DURATION_MINUTES = 10;

// ----------------------------------------------------------------
// Start auction for a food bag (called by decay worker when FREE)
// ----------------------------------------------------------------
export async function startAuction(foodBagId: string) {
  // Check if active auction already exists
  const existing = await prisma.auction.findFirst({
    where: { foodBagId, status: "ACTIVE" },
  });
  if (existing) return existing;

  const endsAt = new Date(Date.now() + AUCTION_DURATION_MINUTES * 60 * 1000);

  const auction = await prisma.auction.create({
    data: { foodBagId, endsAt },
  });

  return auction;
}

// ----------------------------------------------------------------
// Place a bid (DRIVER only)
// ----------------------------------------------------------------
export async function placeBid(
  auctionId: string,
  driverId: string,
  bidAmount: number
) {
  if (bidAmount <= 0) throw new AppError("Bid amount must be positive", 400);

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { bids: true },
  });

  if (!auction) throw new AppError("Auction not found", 404);
  if (auction.status !== "ACTIVE") {
    throw new AppError("Auction is not active", 400);
  }
  if (new Date() > auction.endsAt) {
    throw new AppError("Auction has expired", 400);
  }

  // Check if driver already placed a bid
  const existingBid = auction.bids.find((b: { id: string; driverId: string; auctionId: string; bidAmount: number; createdAt: Date }) => b.driverId === driverId);
  if (existingBid) {
    // Update existing bid
    const updated = await prisma.auctionBid.update({
      where: { id: existingBid.id },
      data: { bidAmount },
    });
    return updated;
  }

  const bid = await prisma.auctionBid.create({
    data: { auctionId, driverId, bidAmount },
  });

  return bid;
}

// ----------------------------------------------------------------
// Close auction — winner is driver with LOWEST bid
// ----------------------------------------------------------------
export async function closeAuction(auctionId: string) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      bids: { orderBy: { bidAmount: "asc" } },
      foodBag: true,
    },
  });

  if (!auction) throw new AppError("Auction not found", 404);

  if (auction.bids.length === 0) {
    // No bids — food goes to FREE for shelters, then COMPOST
    await prisma.auction.update({
      where: { id: auctionId },
      data: { status: "CANCELLED" },
    });
    await prisma.foodBag.update({
      where: { id: auction.foodBagId },
      data: { status: "COMPOST" },
    });
    return { winner: null, status: "CANCELLED" };
  }

  // Winner = lowest bid
  const winnerBid = auction.bids[0];

  await prisma.auction.update({
    where: { id: auctionId },
    data: { status: "COMPLETED" },
  });

  return { winner: winnerBid, status: "COMPLETED" };
}

// ----------------------------------------------------------------
// Get active auctions list
// ----------------------------------------------------------------
export async function listActiveAuctions(cursor?: string, limit = 10) {
  const take = Math.min(limit, 50);

  const auctions = await prisma.auction.findMany({
    where: { status: "ACTIVE" },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { endsAt: "asc" },
    include: {
      foodBag: {
        select: {
          id: true,
          title: true,
          currentPriceCents: true,
          pickupDeadline: true,
        },
      },
      bids: {
        orderBy: { bidAmount: "asc" },
        take: 1, // show current lowest bid
      },
    },
  });

  const hasMore = auctions.length > take;
  const data = hasMore ? auctions.slice(0, take) : auctions;
  const nextCursor = hasMore ? data[data.length - 1].id : null;

  return { data, meta: { nextCursor, hasMore } };
}