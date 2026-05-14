import { prisma } from "../config/prisma";
import { AppError } from "../utils/errors";

// ----------------------------------------------------------------
// Rate a restaurant (RECIPIENT only, once per restaurant)
// ----------------------------------------------------------------
export async function rateRestaurant(
  userId: string,
  restaurantId: string,
  score: number
) {
  if (score < 1 || score > 5) {
    throw new AppError("Score must be between 1 and 5", 400);
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
  });
  if (!restaurant) throw new AppError("Restaurant not found", 404);

  // upsert: update if already rated, create if not
  const rating = await prisma.rating.upsert({
    where: { userId_restaurantId: { userId, restaurantId } },
    update: { score },
    create: { userId, restaurantId, score },
  });

  // Recalculate average rating
  const agg = await prisma.rating.aggregate({
    where: { restaurantId },
    _avg: { score: true },
  });

  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { rating: agg._avg.score ?? 0 },
  });

  return rating;
}