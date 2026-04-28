import { FoodStatus } from "@prisma/client";
import { BadRequestError } from "../utils/errors";

const TRANSITIONS: Record<FoodStatus, FoodStatus[]> = {
  [FoodStatus.FRESH]: [FoodStatus.DISCOUNTED, FoodStatus.COMPOST],
  [FoodStatus.DISCOUNTED]: [FoodStatus.FREE, FoodStatus.COMPOST],
  [FoodStatus.FREE]: [FoodStatus.COMPOST],
  [FoodStatus.COMPOST]: [],
};

export function canTransition(from: FoodStatus, to: FoodStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: FoodStatus, to: FoodStatus): void {
  if (!canTransition(from, to)) {
    throw new BadRequestError(
      `Invalid state transition: ${from} → ${to}. ` +
        `Allowed from ${from}: [${TRANSITIONS[from].join(", ") || "none"}]`
    );
  }
}

export function getNextAllowedStatuses(current: FoodStatus): FoodStatus[] {
  return TRANSITIONS[current];
}

export interface DecayInput {
  currentPriceCents: number;
  originalPriceCents: number;
  status: FoodStatus;
  pickupDeadline: Date;
  decayPercentage: number;
  minPriceCents: number;
  auctionTriggerMinutes: number;
}

export interface DecayResult {
  newPriceCents: number;
  newStatus: FoodStatus;
  changed: boolean;
}

export function applyDecay(input: DecayInput): DecayResult {
  const {
    currentPriceCents,
    status,
    pickupDeadline,
    decayPercentage,
    minPriceCents,
    auctionTriggerMinutes,
  } = input;

  // Terminal states — decay жоқ
  if (status === FoodStatus.FREE || status === FoodStatus.COMPOST) {
    return { newPriceCents: currentPriceCents, newStatus: status, changed: false };
  }

  const now = new Date();
  const minutesUntilDeadline = (pickupDeadline.getTime() - now.getTime()) / 60_000;

  // Deadline өтіп кетті → COMPOST
  if (minutesUntilDeadline <= 0) {
    // status мұнда FRESH немесе DISCOUNTED ғана болуы мүмкін, changed әрқашан true
    return { newPriceCents: 0, newStatus: FoodStatus.COMPOST, changed: true };
  }

  // Auction trigger аймағында → FREE
  if (minutesUntilDeadline <= auctionTriggerMinutes) {
    // status мұнда FRESH немесе DISCOUNTED ғана болуы мүмкін, changed әрқашан true
    return { newPriceCents: 0, newStatus: FoodStatus.FREE, changed: true };
  }

  // Пайыздық decay қолданамыз
  const decayMultiplier = 1 - decayPercentage / 100;
  const decayed = Math.round(currentPriceCents * decayMultiplier);
  const newPriceCents = Math.max(decayed, minPriceCents);
  const newStatus = FoodStatus.DISCOUNTED;
  const changed = newPriceCents !== currentPriceCents || status !== FoodStatus.DISCOUNTED;

  return { newPriceCents, newStatus, changed };
}
