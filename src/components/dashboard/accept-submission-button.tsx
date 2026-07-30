"use client";

import { useActionState } from "react";
import { acceptSubmission, type AcceptSubmissionResult } from "@/lib/problems/actions";

export function AcceptSubmissionButton({
  problemId,
  submissionId,
}: {
  problemId: string;
  submissionId: string;
}) {
  const [state, formAction, pending] = useActionState<AcceptSubmissionResult | undefined, FormData>(
    () => acceptSubmission(problemId, submissionId),
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-2 shrink-0">
      {state && "error" in state && (
        <p className="max-w-xs text-right rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent text-background font-medium px-4 py-2 text-xs hover:bg-accent-dim transition-colors disabled:opacity-60"
      >
        {pending ? "Processing…" : "Accept & pay"}
      </button>
    </form>
  );
}