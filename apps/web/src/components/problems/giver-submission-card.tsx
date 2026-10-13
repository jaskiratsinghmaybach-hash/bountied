import { AcceptSubmissionButton } from "@/components/dashboard/accept-submission-button";
import { RepoAccessStatus } from "@/components/problems/repo-access-status";
import { ReviewButton } from "@/components/problems/review-button";
import { classifySubmissionFailure } from "@/lib/problems/submission-failure";
import type { SubmissionStatus } from "@prisma/client";

const submissionStatusLabel: Record<
  SubmissionStatus,
  { label: string; color: string }
> = {
  SUBMITTED: { label: "Submitted", color: "text-foreground-muted" },
  MIRRORING: { label: "Preparing submission", color: "text-foreground-muted" },
  RUNNING: { label: "Running sandbox", color: "text-emerald-500" },
  AWAITING_REVIEW: { label: "Ready to review", color: "text-primary" },
  SANDBOX_FAILED: { label: "Sandbox failed", color: "text-danger" },
  DEPENDENCY_POLICY_VIOLATION: { label: "Dependency not allowed", color: "text-danger" },
  DEPENDENCY_INSTALL_FAILED: { label: "Dependency install failed", color: "text-danger" },
  UNDER_REVIEW: { label: "Review output", color: "text-emerald-500" },
  ACCEPTED: { label: "Accepted", color: "text-primary" },
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
  attemptNumber: number;
  /** Set by the server's submit gate. PASSED means the code you see is the exact commit that passed the Solver's own test. */
  testStatus: "UNTESTED" | "PASSED";
  testedCommitSha: string | null;
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
  const failure = classifySubmissionFailure(submission);

  return (
    <article className="rounded-lg border border-border bg-surface-raised p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            Attempt {submission.attemptNumber}
          </p>
          <p className="text-xs font-mono text-foreground-muted mt-1">
            Submitted {submission.submittedAt.toLocaleString()}
          </p>
        </div>
        <span className={`text-xs font-mono shrink-0 ${status.color}`}>{status.label}</span>
      </div>

      <p className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted mb-4">
        <span
          className={`inline-block h-2 w-2 rounded-full ${submission.testStatus === "PASSED" ? "bg-success" : "bg-foreground-muted"}`}
          aria-hidden
        />
        {submission.testStatus === "PASSED" ? (
          <>
            <span className="text-foreground">Solver&apos;s own test passed</span>
            {submission.testedCommitSha && (
              <span className="font-mono">commit {submission.testedCommitSha.slice(0, 7)}</span>
            )}
          </>
        ) : (
          <span>Untested: the Solver did not run a passing test on this commit</span>
        )}
      </p>

      <div className="mb-4">
        <p className="text-xs text-foreground-muted uppercase tracking-wide mb-2">
          Solver notes
        </p>
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {submission.writeup}
        </p>
      </div>

      {submission.status === "MIRRORING" && (
        <p className="text-sm text-foreground-muted font-mono mb-4">Preparing submission…</p>
      )}

      {submission.status === "RUNNING" && (
        <p className="text-sm text-emerald-500 font-mono mb-4">Sandbox is running…</p>
      )}

      {/* Zero-source: only the classified, fixed summary is shown. The runner's raw
          error is never stored for Givers (see lib/sandbox/giver-reason.ts), and
          there is deliberately no "show raw error". */}
      {/* A run that failed on Bountied's side is refunded and the submission returns to the
          queue (lib/reviews/start-review.ts). Say so, instead of silently showing it as new. */}
      {submission.status === "AWAITING_REVIEW" && submission.sandboxError && (
        <div className="rounded-md border border-border bg-surface-raised p-4 mb-4">
          <p className="text-xs text-foreground-muted leading-relaxed">
            The last review run couldn&apos;t finish because of a problem on Bountied&apos;s side. You were not charged
            and it didn&apos;t use a free review. You can run it again.
          </p>
        </div>
      )}

      {submission.sandboxError && failure && (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-4 mb-4">
          <p className="text-xs text-foreground-muted uppercase tracking-wide mb-2">
            Sandbox error
          </p>
          <p className="text-sm text-danger leading-relaxed">{failure.summary}</p>
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
          {failure && submission.sandboxExitCode !== null && submission.sandboxExitCode !== 0 && (
            <p className="text-sm text-danger leading-relaxed mb-2">{failure.summary}</p>
          )}
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
