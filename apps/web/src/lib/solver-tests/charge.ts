import { REVIEW_COST_USD } from "@/lib/reviews/pricing";

/**
 * Pure rules for Solver-side sandbox tests: price, free quota, and how a
 * charge is split between deposited credit and earned balance. No database
 * and no I/O here, so every rule can be unit-tested exactly.
 *
 * Product decisions (final):
 *  - A Solver test costs the same as a Giver review.
 *  - Each Solver gets 1 free test per bounty, but only on their first 5
 *    bounties ever. An unused free test stays available on attempts 2 and 3.
 *  - Charge order: deposited credit first, then earned-but-unpaid balance.
 *    Money already moved into a payout request is out of availableBalance,
 *    so it can never be spent here.
 */

export const SOLVER_TEST_COST_USD = REVIEW_COST_USD;
export const SOLVER_FREE_TEST_BOUNTY_LIMIT = 5;
/** Same cap createSubmission enforces; kept here so tests and submit share one number. */
export const MAX_SUBMISSION_ATTEMPTS = 3;
/** Tests a Solver may have running at once (caps sandbox cost from parallel abuse). */
export const SOLVER_MAX_CONCURRENT_TESTS = 2;
/** A RUNNING test older than this is treated as a platform error and refunded. */
export const SOLVER_TEST_STALE_MS = 10 * 60 * 1000;

/** Money is handled in whole cents so 0.1 + 0.2 style float drift can never move a balance. */
export function toCents(value: { toString(): string } | number | string): number {
  return Math.round(Number(value.toString()) * 100);
}

/** Cents back to a two-decimal string, which Prisma accepts for Decimal columns. */
export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function centsToUsd(cents: number): number {
  return cents / 100;
}

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type ChargePlan = {
  ok: boolean;
  /** Cents taken from creditBalance. 0 when !ok. */
  fromCredit: number;
  /** Cents taken from availableBalance. 0 when !ok. */
  fromEarnings: number;
  /** Cents the Solver is short by. 0 when ok. */
  shortfall: number;
};

export function planCharge(costCents: number, creditCents: number, earningsCents: number): ChargePlan {
  const cost = Math.max(0, Math.round(costCents));
  const credit = Math.max(0, Math.round(creditCents));
  const earnings = Math.max(0, Math.round(earningsCents));

  const fromCredit = Math.min(credit, cost);
  const fromEarnings = cost - fromCredit;
  if (fromEarnings > earnings) {
    return { ok: false, fromCredit: 0, fromEarnings: 0, shortfall: fromEarnings - earnings };
  }
  return { ok: true, fromCredit, fromEarnings, shortfall: 0 };
}

/**
 * Is a free test available for this Solver on this bounty right now?
 *  - freeUsedOnThisProblem: a non-ERROR free test already exists on this bounty.
 *  - bountiesWithFreeTest: how many distinct bounties the Solver has a non-ERROR free test on.
 * An ERROR run never counts for either, so a platform failure can't eat the quota.
 */
export function isFreeTestAvailable(input: {
  freeUsedOnThisProblem: boolean;
  bountiesWithFreeTest: number;
  limit?: number;
}): boolean {
  if (input.freeUsedOnThisProblem) return false;
  return input.bountiesWithFreeTest < (input.limit ?? SOLVER_FREE_TEST_BOUNTY_LIMIT);
}
