import { AcceptSubmissionButton } from "@/components/dashboard/accept-submission-button";
import { RepoAccessStatus } from "@/components/problems/repo-access-status";
import { ReviewButton } from "@/components/problems/review-button";
import type { SubmissionStatus } from "@prisma/client";

const submissionStatusLabel: Record<
  SubmissionStatus,
  { label: string; color: string }
> = {
  SUBMITTED: { label: "Submitted", color: "text-foreground-muted" },
  RUNNING: { label: "Running sandbox", color: "text-money" },
  AWAITING_REVIEW: { label: "Ready to review", color: "text-accent" },
  SANDBOX_FAILED: { label: "Sandbox failed", color: "text-danger" },
  UNDER_REVIEW: { label: "Review output", color: "text-money" },
  ACCEPTED: { label: "Accepted", color: "text-accent" },
  REJECTED: { label: "Rejected", color: "text-foreground-muted" },
};

type SubmissionData = {
  id: string;
  status: SubmissionStatus;
  writeup: string;
  sandboxOutput: string | null;
  sandboxExitCode: number | null;
  sandboxError: string | null;
  sandboxRanAt: Date | null;
  submittedAt: Date;
  isRevealed: boolean;
  platformRepoUrl: string | null;
  githubAccessGrantedAt: Date | null;
  solver: { name: string };
};

export function GiverSubmissionCard({
  submission,
  problemId,
  giverId,
  freeReviewsLeft,
  giverGithubUsername,
  problemCompleted,
}: {
  submission: SubmissionData;
  problemId: string;
  giverId: string;
  freeReviewsLeft: number;
  giverGithubUsername: string | null;
  problemCompleted: boolean;
}) {
  const status = submissionStatusLabel[submission.status];

  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-sm font-medium text-foreground">{submission.solver.name}</p>
          <p className="text-xs font-mono text-foreground-muted mt-1">
            Submitted {submission.submittedAt.toLocaleString()}
          </p>
        </div>
        <span className={`text-xs font-mono shrink-0 ${status.color}`}>{status.label}</span>
      </div>

      <div className="mb-4">
        <p className="text-xs text-foreground-muted uppercase tracking-wide mb-2">
          Solver notes
        </p>
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {submission.writeup}
        </p>
      </div>

      {submission.status === "RUNNING" && (
        <p className="text-sm text-money font-mono mb-4">Sandbox is running…</p>
      )}

      {submission.sandboxError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-4 mb-4">
          <p className="text-xs text-foreground-muted uppercase tracking-wide mb-2">
            Sandbox error
          </p>
          <pre className="text-xs font-mono text-danger whitespace-pre-wrap overflow-x-auto">
            {submission.sandboxError}
          </pre>
        </div>
      )}

      {submission.sandboxOutput && (
        <div className="rounded-md border border-border bg-surface-raised p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-foreground-muted uppercase tracking-wide">
              Sandbox output
            </p>
            {submission.sandboxExitCode !== null && (
              <span className="text-xs font-mono text-foreground-muted">
                exit {submission.sandboxExitCode}
              </span>
            )}
          </div>
          <pre className="text-xs font-mono text-foreground whitespace-pre-wrap overflow-x-auto max-h-64">
            {submission.sandboxOutput}
          </pre>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-border">
        {submission.status === "AWAITING_REVIEW" && !problemCompleted && (
          <ReviewButton
            submissionId={submission.id}
            giverId={giverId}
            freeReviewsLeft={freeReviewsLeft}
            status={submission.status}
          />
        )}

        {submission.status === "UNDER_REVIEW" && !problemCompleted && (
          <AcceptSubmissionButton problemId={problemId} submissionId={submission.id} />
        )}

        {submission.isRevealed && (
          <RepoAccessStatus
            submissionId={submission.id}
            platformRepoUrl={submission.platformRepoUrl}
            accessGranted={!!submission.githubAccessGrantedAt}
            giverGithubUsername={giverGithubUsername}
          />
        )}
      </div>
    </article>
  );
}
