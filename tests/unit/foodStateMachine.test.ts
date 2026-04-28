import { FoodStatus } from "@prisma/client";
import {
  canTransition,
  assertTransition,
  applyDecay,
  getNextAllowedStatuses,
} from "../../src/services/foodStateMachine";
import { BadRequestError } from "../../src/utils/errors";

const BASE_DECAY_INPUT = {
  currentPriceCents: 100000,
  originalPriceCents: 100000,
  decayPercentage: 10,
  minPriceCents: 50000,
  auctionTriggerMinutes: 30,
};

function futureDate(minutesFromNow: number): Date {
  return new Date(Date.now() + minutesFromNow * 60_000);
}

describe("FoodStateMachine — state transitions", () => {
  describe("canTransition()", () => {
    it("FRESH → DISCOUNTED is valid", () => {
      expect(canTransition(FoodStatus.FRESH, FoodStatus.DISCOUNTED)).toBe(true);
    });

    it("FRESH → COMPOST is valid", () => {
      expect(canTransition(FoodStatus.FRESH, FoodStatus.COMPOST)).toBe(true);
    });

    it("DISCOUNTED → FREE is valid", () => {
      expect(canTransition(FoodStatus.DISCOUNTED, FoodStatus.FREE)).toBe(true);
    });

    it("FREE → COMPOST is valid", () => {
      expect(canTransition(FoodStatus.FREE, FoodStatus.COMPOST)).toBe(true);
    });

    it("FRESH → FREE is invalid (must go through DISCOUNTED)", () => {
      expect(canTransition(FoodStatus.FRESH, FoodStatus.FREE)).toBe(false);
    });

    it("COMPOST → FRESH is invalid (terminal state)", () => {
      expect(canTransition(FoodStatus.COMPOST, FoodStatus.FRESH)).toBe(false);
    });

    it("DISCOUNTED → FRESH is invalid (no going back)", () => {
      expect(canTransition(FoodStatus.DISCOUNTED, FoodStatus.FRESH)).toBe(false);
    });
  });

  describe("assertTransition()", () => {
    it("does not throw on valid transition", () => {
      expect(() =>
        assertTransition(FoodStatus.FRESH, FoodStatus.DISCOUNTED)
      ).not.toThrow();
    });

    it("throws BadRequestError on invalid transition", () => {
      expect(() =>
        assertTransition(FoodStatus.COMPOST, FoodStatus.FRESH)
      ).toThrow(BadRequestError);
    });
  });

  describe("getNextAllowedStatuses()", () => {
    it("FRESH allows DISCOUNTED and COMPOST", () => {
      const next = getNextAllowedStatuses(FoodStatus.FRESH);
      expect(next).toContain(FoodStatus.DISCOUNTED);
      expect(next).toContain(FoodStatus.COMPOST);
    });

    it("COMPOST has no allowed transitions", () => {
      expect(getNextAllowedStatuses(FoodStatus.COMPOST)).toHaveLength(0);
    });
  });
});

describe("FoodStateMachine — decay logic", () => {
  it("applies 10% decay for FRESH bag with 2h until deadline", () => {
    const result = applyDecay({
      ...BASE_DECAY_INPUT,
      status: FoodStatus.FRESH,
      pickupDeadline: futureDate(120),
    });
    expect(result.newPriceCents).toBe(90000); // 100000 * 0.9
    expect(result.changed).toBe(true);
  });

  it("does not go below minPriceCents floor", () => {
    const result = applyDecay({
      ...BASE_DECAY_INPUT,
      currentPriceCents: 52000, // close to min
      status: FoodStatus.DISCOUNTED,
      pickupDeadline: futureDate(120),
    });
    expect(result.newPriceCents).toBeGreaterThanOrEqual(50000);
  });

  it("marks as FREE when within auction trigger window", () => {
    const result = applyDecay({
      ...BASE_DECAY_INPUT,
      status: FoodStatus.DISCOUNTED,
      pickupDeadline: futureDate(20), // 20 min left, trigger is 30
    });
    expect(result.newStatus).toBe(FoodStatus.FREE);
    expect(result.newPriceCents).toBe(0);
  });

  it("marks as COMPOST when deadline has passed", () => {
    const result = applyDecay({
      ...BASE_DECAY_INPUT,
      status: FoodStatus.FRESH,
      pickupDeadline: futureDate(-5), // 5 min ago
    });
    expect(result.newStatus).toBe(FoodStatus.COMPOST);
    expect(result.newPriceCents).toBe(0);
  });

  it("does not decay FREE items", () => {
    const result = applyDecay({
      ...BASE_DECAY_INPUT,
      currentPriceCents: 0,
      status: FoodStatus.FREE,
      pickupDeadline: futureDate(60),
    });
    expect(result.changed).toBe(false);
    expect(result.newStatus).toBe(FoodStatus.FREE);
  });

  it("does not decay COMPOST items", () => {
    const result = applyDecay({
      ...BASE_DECAY_INPUT,
      currentPriceCents: 0,
      status: FoodStatus.COMPOST,
      pickupDeadline: futureDate(-10),
    });
    expect(result.changed).toBe(false);
    expect(result.newStatus).toBe(FoodStatus.COMPOST);
  });
});
