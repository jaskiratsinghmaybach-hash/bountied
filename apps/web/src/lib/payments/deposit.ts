/**
 * Validation for a wallet top-up amount, shared by the checkout route (before
 * any money is asked for) and the Whop webhook (before any money is credited).
 * One rule in one place.
 *
 *  - dollars and cents only: what the button says is exactly what is charged
 *    and exactly what is credited, with no hidden rounding;
 *  - at least $1 (the amount field's own minimum);
 *  - at most MAX_DEPOSIT_USD, which is Whop's own ceiling: Whop caps a single
 *    checkout at $2,500 for accounts that haven't been approved for higher
 *    amounts (docs.whop.com, "Access Higher Checkout Links"). Asking Whop for
 *    more would fail at checkout, so the form says so up front. If your Whop
 *    account is approved for higher checkouts, raise this constant to match.
 *    It is also far below the ledger column's limit, so a payment that
 *    succeeds can always be credited.
 */
export const MIN_DEPOSIT_USD = 1;
export const MAX_DEPOSIT_USD = 2_500;

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
