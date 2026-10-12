import { describe, expect, it } from "vitest";
import { MAX_DEPOSIT_USD, MIN_DEPOSIT_USD, parseDepositAmount } from "./deposit";

describe("parseDepositAmount", () => {
  it("accepts whole and cent amounts", () => {
    expect(parseDepositAmount(50)).toEqual({ ok: true, amount: 50 });
    expect(parseDepositAmount(12.34)).toEqual({ ok: true, amount: 12.34 });
    expect(parseDepositAmount(0.1 + 1)).toEqual({ ok: true, amount: 1.1 });
  });

  it("accepts the limits", () => {
    expect(parseDepositAmount(MIN_DEPOSIT_USD).ok).toBe(true);
    expect(parseDepositAmount(MAX_DEPOSIT_USD).ok).toBe(true);
  });

  it("refuses anything below the minimum or above the maximum", () => {
    expect(parseDepositAmount(0.99).ok).toBe(false);
    expect(parseDepositAmount(0).ok).toBe(false);
    expect(parseDepositAmount(-5).ok).toBe(false);
    expect(parseDepositAmount(MAX_DEPOSIT_USD + 0.01).ok).toBe(false);
    expect(parseDepositAmount(1e21).ok).toBe(false);
  });

  it("refuses fractions of a cent instead of rounding them silently", () => {
    const r = parseDepositAmount(10.005);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cents/);
  });

  it("refuses non-numbers", () => {
    for (const v of [undefined, null, "50", NaN, Infinity, -Infinity, {}, [], true]) {
      expect(parseDepositAmount(v).ok, String(v)).toBe(false);
    }
  });
});
