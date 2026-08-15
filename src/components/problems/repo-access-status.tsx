"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { ConnectGithubPrompt } from "@/components/auth/connect-github-prompt";
import { retryGithubAccessGrant } from "@/lib/github/retry-grant-actions";

/**
 * Shown on the giver detail page for a REVEALED submission (isRevealed
 * true — payment already released). Three states:
 *
 *   1. Giver has no githubUsername on file yet -> show ConnectGithubPrompt.
 *      Same component solvers use; it's generic, no giver-specific logic
 *      needed in it. Once connected, githubUsername is set for this user
 *      FOREVER — this prompt never shows again on any future accepted
 *      submission, matching the "one-time, not per-bounty" requirement.
 *   2. Giver has a username, but the invite hasn't succeeded yet
 *      (githubAccessGrantedAt is null — most often because they'd just
 *      connected GitHub after this submission's release already ran) ->
 *      offer a manual retry.
 *   3. Invite succeeded -> show the real link to the platform mirror.
 */
export function RepoAccessStatus({
  submissionId,
  platformRepoUrl,
  accessGranted,
  giverGithubUsername,
}: {
  submissionId: string;
  /** The platform-owned mirror's URL — never the solver's original repo. */
  platformRepoUrl: string | null;
  accessGranted: boolean;
  giverGithubUsername: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (accessGranted && platformRepoUrl) {
    return (
      <div className="flex items-center gap-2">
        <CircleCheck size={14} className="text-primary shrink-0" />
        <a
          href={platformRepoUrl}
          className="text-sm text-primary hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          View source repo →
        </a>
      </div>
    );
  }

  if (!giverGithubUsername) {
    return (
      <ConnectGithubPrompt reason="Payment released — connect GitHub to accept your collaborator invite and view the source." />
    );
  }

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      const result = await retryGithubAccessGrant(submissionId);
      if ("error" in result) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="flex items-start gap-2 mb-2">
        <TriangleAlert size={14} className="text-emerald-500 shrink-0 mt-0.5" />
        <p className="text-sm text-foreground-muted">
          Payment released, but the repo invite hasn&apos;t gone through yet.
        </p>
      </div>
      {error && <p className="text-xs text-danger mb-2">{error}</p>}
      <button
        type="button"
        onClick={handleRetry}
        disabled={isPending}
        className="rounded-md border border-border text-foreground text-xs font-medium px-3 py-1.5 hover:bg-surface-raised transition-colors disabled:opacity-60"
      >
        {isPending ? "Retrying…" : "Retry invite"}
      </button>
    </div>
  );
}
