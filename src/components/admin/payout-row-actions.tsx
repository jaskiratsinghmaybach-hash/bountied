"use client";

import { useTransition } from "react";
import { markPayoutSucceeded, markPayoutFailed } from "@/lib/payouts/admin-actions";

export function PayoutRowActions({ payoutRequestId }: { payoutRequestId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => markPayoutSucceeded(payoutRequestId))}
        className="rounded-md bg-accent text-background text-xs font-medium px-3 py-1.5 hover:bg-accent-dim transition-colors disabled:opacity-60"
      >
        Mark sent
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (confirm("Mark this payout as failed? The amount will be refunded to the solver's available balance.")) {
            startTransition(() => markPayoutFailed(payoutRequestId));
          }
        }}
        className="rounded-md border border-danger/40 text-danger text-xs font-medium px-3 py-1.5 hover:bg-danger/10 transition-colors disabled:opacity-60"
      >
        Failed
      </button>
    </div>
  );
}
