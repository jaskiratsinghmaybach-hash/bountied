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

/** Round to cents. All money math in this file funnels through this. */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/** What a Giver must have in creditBalance to fund a bounty of this size. */
export function creditsRequiredToFund(bountyAmount: number): number {
  return money(bountyAmount * (1 + GIVER_FUNDING_FEE_RATE));
}

/** The platform's cut of a bounty at funding time. */
export function fundingFeeFor(bountyAmount: number): number {
  return money(bountyAmount * GIVER_FUNDING_FEE_RATE);
}

/** What lands in the solver's available balance when escrow releases. */
export function amountCreditedOnRelease(bountyAmount: number): number {
  return money(bountyAmount * (1 - SOLVER_RELEASE_FEE_RATE));
}

/** The platform's cut of a bounty at release time. */
export function releaseFeeFor(bountyAmount: number): number {
  return money(bountyAmount * SOLVER_RELEASE_FEE_RATE);
}

/** What actually gets wired to the solver's bank for a withdrawal request. */
export function amountPaidOnWithdrawal(requestedAmount: number): number {
  return money(requestedAmount * (1 - SOLVER_WITHDRAWAL_FEE_RATE));
}

/** The platform's cut of a withdrawal. */
export function withdrawalFeeFor(requestedAmount: number): number {
  return money(requestedAmount * SOLVER_WITHDRAWAL_FEE_RATE);
}
