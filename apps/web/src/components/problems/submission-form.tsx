"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { Terminal, TriangleAlert } from "lucide-react";
import {
  createSubmission,
  type CreateSubmissionResult,
} from "@/lib/problems/submission-actions";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { RepoSelector } from "./repo-selector";
import { SolverTestPanel } from "./solver-test-panel";
import { CommitHistoryPanel } from "./commit-history-panel";

const initialState: CreateSubmissionResult | undefined = undefined;

export function SubmissionForm({
  problemId,
  githubConnected,
}: {
  problemId: string;
  githubConnected: boolean;
}) {
  const boundAction = createSubmission.bind(null, problemId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [hasRepo, setHasRepo] = useState(false);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(null);
  const draftKey = `bountied:submission-draft:${problemId}`;
  useEffect(() => {
    try { const raw = localStorage.getItem(draftKey); if (!raw) return; const draft = JSON.parse(raw) as { repoUrl?: string; selectedCommitSha?: string; writeup?: string };
      if (typeof draft.repoUrl === "string") setRepoUrl(draft.repoUrl);
      if (typeof draft.selectedCommitSha === "string") setSelectedCommitSha(draft.selectedCommitSha);
      const writeup = document.getElementById("writeup") as HTMLTextAreaElement | null; if (writeup && typeof draft.writeup === "string") writeup.value = draft.writeup;
    } catch { /* Ignore an invalid local draft. */ }
  }, [draftKey]);
  const saveDraft = useCallback((patch: Record<string, string | null>) => {
    try { const current = JSON.parse(localStorage.getItem(draftKey) ?? "{}") as Record<string, string | null>; localStorage.setItem(draftKey, JSON.stringify({ ...current, ...patch })); } catch { /* Storage may be disabled. */ }
  }, [draftKey]);
  const handleSelectionChange = useCallback((has: boolean) => {
    setHasRepo(has);
  }, []);
  useEffect(() => {
    if (state && "ok" in state) {
      try { localStorage.removeItem(draftKey); } catch { /* Storage may be disabled. */ }
    }
  }, [state, draftKey]);

  if (state && "ok" in state) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center gap-2 mb-2">
          <Terminal size={16} className="text-foreground" />
          <p className="text-sm font-medium text-foreground">Submission received</p>
        </div>
        <p className="text-xs text-foreground-muted">
          Your repo is being prepared for the giver&apos;s review. This takes
          a few seconds. Check your submissions page to follow its status.
        </p>
      </div>
    );
  }

  if (!githubConnected) {
    return (
      <Alert className="border-border bg-surface">
        <FaGithub className="h-4 w-4 text-foreground" />
        <AlertTitle className="text-foreground font-medium">GitHub not connected</AlertTitle>
        <AlertDescription className="mt-2 flex flex-col gap-3">
          <p className="text-xs text-foreground-muted">
            Your GitHub isn&apos;t connected. Go to Integrations to connect it before submitting.
          </p>
          <Button asChild variant="outline" size="sm" className="w-fit border-border bg-surface hover:bg-surface-raised hover:text-foreground">
            <Link href="/integrations">Go to Integrations</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-sm font-medium text-foreground mb-1">
        Submit your solution
      </h2>
      <p className="text-xs text-foreground-muted mb-5">
        Your repo will be run in an isolated sandbox when the giver reviews
        it. The giver sees only the captured terminal output and whether it
        passed — not your source code. You can test it yourself first.
      </p>

      {state && "error" in state && (
        <Alert variant="destructive" className="mb-4">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{state.error}</span>
            {state.docsUrl && (
              <Link href={state.docsUrl} target="_blank" className="underline w-fit">
                How to fix this
              </Link>
            )}
          </AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.82fr)]">
        <input type="hidden" name="selectedCommitSha" value={selectedCommitSha ?? ""} />
        <div className="min-w-0 flex flex-col gap-5">
        <div>
          <label
            htmlFor="repoUrl"
            className="block text-xs text-foreground-muted mb-1.5"
          >
            GitHub repo URL
          </label>
          <RepoSelector defaultValue={repoUrl ?? undefined} onSelectionChange={handleSelectionChange} onSelect={(repo) => { setRepoUrl(repo.htmlUrl); setSelectedCommitSha(null); saveDraft({ repoUrl: repo.htmlUrl, selectedCommitSha: null }); }} />
          <p className="text-[11px] text-foreground-muted mt-1">
            Public or private — your repo stays private from the giver until
            they release payment.
          </p>
        </div>

        <SolverTestPanel problemId={problemId} repoUrl={repoUrl} selectedCommitSha={selectedCommitSha} onCommitResolved={(sha) => { setSelectedCommitSha(sha); saveDraft({ selectedCommitSha: sha }); }} />

        <div>
          <label
            htmlFor="writeup"
            className="block text-xs text-foreground-muted mb-1.5"
          >
            Explain your approach
          </label>
          <Textarea
            id="writeup"
            name="writeup"
            required
            minLength={30}
            rows={4}
            placeholder="What did you build? What approach did you take? Any known limitations or tradeoffs worth the giver knowing before they review the output?"
            defaultValue=""
            onChange={(e) => saveDraft({ writeup: e.target.value })}
            className="bg-surface-raised border-border text-foreground placeholder:text-foreground-muted focus-visible:ring-0 focus-visible:border-foreground-muted resize-y"
          />
        </div>

        <Button
          type="submit"
          disabled={pending || !hasRepo}
          className="self-start"
        >
          {pending ? "Submitting…" : "Submit solution"}
        </Button>
        </div>
        <div className="min-w-0 xl:row-span-2">
          <CommitHistoryPanel problemId={problemId} repoUrl={repoUrl} selectedSha={selectedCommitSha} onSelect={(sha) => { setSelectedCommitSha(sha); saveDraft({ selectedCommitSha: sha }); }} />
        </div>
      </form>
    </div>
  );
}
