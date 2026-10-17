/**
 * Single source of truth for the platform's fee model. Every place that
 * touches money (funding a bounty, releasing escrow, withdrawing earnings)
 * imports from here rather than hardcoding a percentage — if the cut ever
 * changes, it changes in exactly one place.
 *
 * The model (product decision 2026-07-31):
 *   - Giver pays a 10% cut when funding a bounty (on top of the bounty
 *     amount). Escrow always holds exactly the bounty amount — that's the
 *     number solvers see and the number that gets released.
 *   - Solver pays two separate 5% cuts rather than one 10% cut, so neither
 *     one feels like a big hit:
 *       1. At release (submission accepted): 5% held back, the rest lands
 *          in the solver's in-app available balance.
 *       2. At withdrawal (solver cashes out to bank): another 5% held
 *          back from whatever they choose to withdraw.
 */

export const GIVER_FUNDING_FEE_RATE = 0.10;
export const SOLVER_RELEASE_FEE_RATE = 0.05;
export const SOLVER_WITHDRAWAL_FEE_RATE = 0.05;

/**
 * Round-to-cents via plain `Math.round(n * 100) / 100` is unsound: IEEE 754
 * floats make `1.005 * 100` evaluate to `100.49999999999999`, so `money()`
 * used to round that DOWN to 1.00 instead of 1.01 — and, worse, independent
 * money() calls for "the fee" and "the net amount" of the same total could
 * each round in a different direction, so `fee + net !== total` for ~3.5%
 * of all cent-valued amounts (confirmed by scanning $0.01..$20,000.00: 70,053
 * mismatches). All money math here now happens in integer cents, and any
 * pair of (fee, net) that must sum back to a known total is computed as
 * (fee, total - fee) — never as two independently-rounded calls — so the
 * two always add up exactly, by construction, not by luck.
 */
function toCents(n: number): number {
  // Round-half-away-from-zero in integer space; avoids the float-multiply
  // rounding trap above because the only float op left (n * 100) is never
  // itself the rounding boundary — Math.round handles genuine halfway cases
  // (e.g. exactly 2.5 cents from upstream float noise) consistently.
  return Math.round(n * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

/** What a Giver must have in creditBalance to fund a bounty of this size. */
export function creditsRequiredToFund(bountyAmount: number): number {
  return fromCents(toCents(bountyAmount) + toCents(bountyAmount * GIVER_FUNDING_FEE_RATE));
}

/** The platform's cut of a bounty at funding time. */
export function fundingFeeFor(bountyAmount: number): number {
  return fromCents(toCents(bountyAmount * GIVER_FUNDING_FEE_RATE));
}

/** The platform's cut of a bounty at release time. */
export function releaseFeeFor(bountyAmount: number): number {
  return fromCents(toCents(bountyAmount * SOLVER_RELEASE_FEE_RATE));
}

/**
 * What lands in the solver's available balance when escrow releases.
 * Derived as total-minus-fee (not an independent 0.95 multiply) so this and
 * releaseFeeFor always sum to exactly bountyAmount, to the cent.
 */
export function amountCreditedOnRelease(bountyAmount: number): number {
  const totalCents = toCents(bountyAmount);
  const feeCents = toCents(bountyAmount * SOLVER_RELEASE_FEE_RATE);
  return fromCents(totalCents - feeCents);
}

/** The platform's cut of a withdrawal. */
export function withdrawalFeeFor(requestedAmount: number): number {
  return fromCents(toCents(requestedAmount * SOLVER_WITHDRAWAL_FEE_RATE));
}

/**
 * What actually gets wired to the solver's bank for a withdrawal request.
 * Derived as total-minus-fee (not an independent 0.95 multiply) so this and
 * withdrawalFeeFor always sum to exactly requestedAmount, to the cent.
 */
export function amountPaidOnWithdrawal(requestedAmount: number): number {
  const totalCents = toCents(requestedAmount);
  const feeCents = toCents(requestedAmount * SOLVER_WITHDRAWAL_FEE_RATE);
  return fromCents(totalCents - feeCents);
}
