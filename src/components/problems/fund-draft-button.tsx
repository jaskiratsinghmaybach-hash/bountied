"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryFundDraft, type CreateProblemResult } from "@/lib/problems/create-actions";
import { InsufficientCreditsModal } from "@/components/payments/insufficient-credits-modal";

export function FundDraftButton({
  problemId,
  requiredTotal,
}: {
  problemId: string;
  /** bountyAmount * 1.10 — the full cost to fund this draft, for display before the first attempt. */
  requiredTotal: number;
}) {
  const router = useRouter();
  const [result, setResult] = useState<CreateProblemResult | { ok: true } | null>(null);
  const [modalDismissed, setModalDismissed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleFund() {
    startTransition(async () => {
      const res = await retryFundDraft(problemId);
      if ("ok" in res) {
        router.refresh();
        return;
      }
      setResult(res);
      setModalDismissed(false);
    });
  }

  return (
    <div className="rounded-lg border border-money/30 bg-emerald-500/5 p-5 mb-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-foreground mb-0.5">This bounty isn&apos;t funded yet</p>
          <p className="text-xs text-foreground-muted">
            Fund it from your credit balance to make it visible to solvers.
          </p>
        </div>
        <button
          type="button"
          onClick={handleFund}
          disabled={isPending}
          className="rounded-md bg-primary text-background font-medium px-5 py-2.5 text-sm hover:bg-primary/80 transition-colors disabled:opacity-60 shrink-0"
        >
          {isPending ? "Funding…" : `Fund $${requiredTotal.toFixed(2)}`}
        </button>
      </div>

      {result && "error" in result && (
        <p className="text-xs text-danger mt-3">{result.error}</p>
      )}

      {result && "insufficientCredits" in result && !modalDismissed && (
        <InsufficientCreditsModal
          required={result.required}
          draftProblemId={result.draftProblemId}
          onClose={() => setModalDismissed(true)}
        />
      )}
    </div>
  );
}
