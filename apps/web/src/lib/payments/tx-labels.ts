import type { CreditTransactionType } from "@prisma/client";

/** What each wallet ledger row is called on screen. Exhaustive: a new transaction type fails the typecheck until it is named here. */
export const TX_TYPE_LABEL: Record<CreditTransactionType, string> = {
  PURCHASE: "Credit purchase",
  BOUNTY_FUNDING: "Bounty funding",
  SUBMISSION_REVIEW: "Submission review",
  SANDBOX_TEST: "Sandbox test",
  REFUND: "Refund",
};

export function formatTxAmount(amount: number): string {
  const abs = Math.abs(amount).toFixed(2);
  if (amount < 0) return `-$${abs}`;
  if (amount > 0) return `+$${abs}`;
  return `$${abs}`;
}
