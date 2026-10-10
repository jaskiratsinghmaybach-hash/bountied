import type { ComponentProps } from "react";
import { GiverSubmissionCard } from "@/components/problems/giver-submission-card";
import { NotifySolverDialog, type NotifyAttempt } from "@/components/problems/notify-solver-dialog";

type SubmissionData = ComponentProps<typeof GiverSubmissionCard>["submission"];

/**
 * Groups one solver's submission attempts on a problem under a single
 * header with ONE "Notify solver" button, instead of each attempt
 * rendering as a fully separate card with its own notify button
 * (product decision 2026-09-30 — reported: attempts from the same
 * solver looked like unrelated submissions, and offering a notify
 * button per attempt made no sense once a Giver could want to reference
 * several attempts in one message). Each attempt still renders its own
 * full status/output via GiverSubmissionCard; this only adds the shared
 * header and consolidates the one notify action.
 */
export function GiverSolverGroup({
  solverName,
  submissions,
  problemId,
  giverId,
  freeReviewsLeft,
  giverGithubUsername,
  problemCompleted,
}: {
  solverName: string;
  /** Every attempt from this one solver on this problem, any order. */
  submissions: SubmissionData[];
  problemId: string;
  giverId: string;
  freeReviewsLeft: number;
  giverGithubUsername: string | null;
  problemCompleted: boolean;
}) {
  const sorted = [...submissions].sort((a, b) => a.attemptNumber - b.attemptNumber);
  const attempts: NotifyAttempt[] = sorted.map((s) => ({
    submissionId: s.id,
    attemptNumber: s.attemptNumber,
  }));

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <p className="text-sm font-medium text-foreground">{solverName}</p>
          <p className="text-xs text-foreground-muted mt-0.5">
            {sorted.length} {sorted.length === 1 ? "attempt" : "attempts"}
          </p>
        </div>
        <NotifySolverDialog attempts={attempts} solverName={solverName} />
      </div>

      <div className="flex flex-col gap-3">
        {sorted.map((submission) => (
          <GiverSubmissionCard
            key={submission.id}
            submission={submission}
            problemId={problemId}
            giverId={giverId}
            freeReviewsLeft={freeReviewsLeft}
            giverGithubUsername={giverGithubUsername}
            problemCompleted={problemCompleted}
          />
        ))}
      </div>
    </div>
  );
}
