/**
 * Validation for a wallet top-up amount, shared by the checkout route (before
 * any money is asked for) and the Whop webhook (before any money is credited).
 * One rule in one place.
 *
 *  - dollars and cents only: what the button says is exactly what is charged
 *    and exactly what is credited, with no hidden rounding;
 *  - at least $1 (the amount field's own minimum);
 *  - at most MAX_DEPOSIT_USD: the ledger column holds 10 digits before the
 *    decimal point, and a payment that succeeds but can't be credited is the
 *    worst failure this flow can have.
 */
export const MIN_DEPOSIT_USD = 1;
export const MAX_DEPOSIT_USD = 10_000;

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type DepositAmountResult = { ok: boolean; amount?: number; error?: string };

export function parseDepositAmount(raw: unknown): DepositAmountResult {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { ok: false, error: "Enter an amount in dollars." };
  }
  if (Math.abs(raw * 100 - Math.round(raw * 100)) > 1e-6) {
    return { ok: false, error: "Enter an amount in dollars and cents, like 25.00." };
  }
  const amount = Math.round(raw * 100) / 100;
  if (amount < MIN_DEPOSIT_USD) return { ok: false, error: `The minimum top-up is $${MIN_DEPOSIT_USD.toFixed(2)}.` };
  if (amount > MAX_DEPOSIT_USD) return { ok: false, error: `The maximum top-up is $${MAX_DEPOSIT_USD.toLocaleString("en-US")}.` };
  return { ok: true, amount };
}
