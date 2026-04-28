import * as cron from "node-cron";
import { FoodStatus } from "@prisma/client";
import { prisma } from "../config/prisma";
import { applyDecay } from "../services/foodStateMachine";
import { env } from "../config/env";

export async function runDecay(): Promise<{ processed: number; updated: number }> {
  const bags = await prisma.foodBag.findMany({
    where: { status: { in: [FoodStatus.FRESH, FoodStatus.DISCOUNTED] } },
  });

  let updated = 0;

  for (const bag of bags) {
    const result = applyDecay({
      currentPriceCents: bag.currentPriceCents,
      originalPriceCents: bag.originalPriceCents,
      status: bag.status,
      pickupDeadline: bag.pickupDeadline,
      decayPercentage: env.decayPercentage,
      minPriceCents: env.minFoodPriceCents,
      auctionTriggerMinutes: env.auctionTriggerMinutes,
    });

    if (result.changed) {
      await prisma.foodBag.update({
        where: { id: bag.id },
        data: { currentPriceCents: result.newPriceCents, status: result.newStatus },
      });
      updated++;
    }
  }

  return { processed: bags.length, updated };
}

export function startDecayWorker(): void {
  const intervalMinutes = env.decayIntervalMinutes;
  const cronExpr = `*/${intervalMinutes} * * * *`;

  cron.schedule(cronExpr, async () => {
    try {
      const { processed, updated } = await runDecay();
      console.log(`[DecayWorker] Processed: ${processed}, Updated: ${updated}`);
    } catch (err) {
      console.error("[DecayWorker] Error:", err);
    }
  });

  console.log(`✅ Decay worker started (every ${intervalMinutes} min)`);
}
