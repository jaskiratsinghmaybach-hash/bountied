import { describe, expect, it } from "vitest";
import {
  SOLVER_FREE_TEST_BOUNTY_LIMIT,
  SOLVER_TEST_COST_USD,
  centsToAmount,
  isFreeTestAvailable,
  planCharge,
  toCents,
} from "./charge";

describe("price", () => {
  it("a Solver test costs the same $0.04 as a Giver review", () => {
    expect(SOLVER_TEST_COST_USD).toBe(0.04);
    expect(toCents(SOLVER_TEST_COST_USD)).toBe(4);
  });
});

describe("toCents / centsToAmount", () => {
  it("is exact where floats drift", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents("57.40")).toBe(5740);
    expect(toCents({ toString: () => "0.04" })).toBe(4);
    expect(centsToAmount(4)).toBe("0.04");
    expect(centsToAmount(5740)).toBe("57.40");
    expect(centsToAmount(0)).toBe("0.00");
  });
});

describe("planCharge: deposited credit first, then earnings", () => {
  it("takes everything from credit when credit covers it", () => {
    expect(planCharge(4, 100, 500)).toEqual({ ok: true, fromCredit: 4, fromEarnings: 0, shortfall: 0 });
  });

  it("takes exactly the credit that exists, then the rest from earnings", () => {
    expect(planCharge(4, 3, 500)).toEqual({ ok: true, fromCredit: 3, fromEarnings: 1, shortfall: 0 });
  });

  it("takes everything from earnings when there is no credit", () => {
    expect(planCharge(4, 0, 4)).toEqual({ ok: true, fromCredit: 0, fromEarnings: 4, shortfall: 0 });
  });

  it("succeeds at the exact boundary (credit + earnings == cost)", () => {
    expect(planCharge(4, 1, 3)).toEqual({ ok: true, fromCredit: 1, fromEarnings: 3, shortfall: 0 });
  });

  it("fails when the two balances together are one cent short, charging nothing", () => {
    expect(planCharge(4, 1, 2)).toEqual({ ok: false, fromCredit: 0, fromEarnings: 0, shortfall: 1 });
  });

  it("never plans a negative amount from a negative or fractional balance", () => {
    expect(planCharge(4, -50, 10)).toEqual({ ok: true, fromCredit: 0, fromEarnings: 4, shortfall: 0 });
    expect(planCharge(0, 0, 0)).toEqual({ ok: true, fromCredit: 0, fromEarnings: 0, shortfall: 0 });
  });
});

describe("isFreeTestAvailable", () => {
  it("is free on a fresh bounty for a new Solver", () => {
    expect(isFreeTestAvailable({ freeUsedOnThisProblem: false, bountiesWithFreeTest: 0 })).toBe(true);
  });

  it("allows only one free test per bounty", () => {
    expect(isFreeTestAvailable({ freeUsedOnThisProblem: true, bountiesWithFreeTest: 1 })).toBe(false);
  });

  it("is free on the 5th bounty but not the 6th", () => {
    expect(SOLVER_FREE_TEST_BOUNTY_LIMIT).toBe(5);
    expect(isFreeTestAvailable({ freeUsedOnThisProblem: false, bountiesWithFreeTest: 4 })).toBe(true);
    expect(isFreeTestAvailable({ freeUsedOnThisProblem: false, bountiesWithFreeTest: 5 })).toBe(false);
  });

  it("keeps a bounty's unused free test available while the Solver is under the cap", () => {
    // Attempts 2 and 3 on a bounty whose free test was never used (for example
    // the first run hit a platform error) are still free.
    expect(isFreeTestAvailable({ freeUsedOnThisProblem: false, bountiesWithFreeTest: 3 })).toBe(true);
  });
});
