"use client";

import { useActionState, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { Terminal, TriangleAlert } from "lucide-react";
import {
  createSubmission,
  // @ts-ignore
  type CreateSubmissionResult,
} from "@/lib/problems/submission-actions";
import { ConnectGithubPrompt } from "@/components/auth/connect-github-prompt";
import { RepoSelector } from "./repo-selector";

// @ts-ignore
const initialState: CreateSubmissionResult | undefined = undefined;

export function SubmissionForm({
  problemId,
  runCommand,
  runtime,
  githubConnected,
}: {
  problemId: string;
  runCommand: string;
  runtime: string;
  githubConnected: boolean;
}) {
  // @ts-ignore
  const boundAction = createSubmission.bind(null, problemId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [hasRepo, setHasRepo] = useState(false);

  // Success state — show a "you're in the queue" confirmation
  if (state && "ok" in state) {
    return (
      <div className="rounded-lg border border-accent/30 bg-primary/5 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Terminal size={16} className="text-primary" />
          <p className="text-sm font-medium text-foreground">Submission received</p>
        </div>
        <p className="text-xs text-foreground-muted">
          Your repo is being cloned and run in a sandbox now. This usually
          takes under 30 seconds — check back on your submissions page to
          see the captured output once it&apos;s ready.
        </p>
      </div>
    );
  }

  // GitHub not connected — reuse the shared prompt, which correctly uses
  // linkIdentity (stays on the same account) and routes through
  // /auth/callback (which is what actually captures and stores the token).
  if (!githubConnected) {
    return (
      <ConnectGithubPrompt reason="Submissions run your code directly from a GitHub repo. Connect your account to submit — it only takes a moment." />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-sm font-medium text-foreground mb-1">
        Submit your solution
      </h2>
      <p className="text-xs text-foreground-muted mb-5">
        Your repo will be cloned and run in an isolated sandbox. The giver
        sees only the captured terminal output — not your source code.
      </p>

      {/* Show the solver exactly what command will run against their code */}
      <div className="rounded-md bg-surface-raised border border-border px-3 py-2.5 mb-6 flex items-center gap-2">
        <Terminal size={13} className="text-foreground-muted shrink-0" />
        <div>
          <p className="text-[10px] text-foreground-muted uppercase tracking-wide mb-0.5">
            Run command ({runtime.toLowerCase()})
          </p>
          <p className="text-xs font-mono text-foreground">{runCommand}</p>
        </div>
      </div>

      {state && "error" in state && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 flex items-start gap-2 mb-4">
          <TriangleAlert size={14} className="text-danger shrink-0 mt-0.5" />
          <p className="text-xs text-danger">{state.error}</p>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-5">
        <div>
          <label
            htmlFor="repoUrl"
            className="block text-xs text-foreground-muted mb-1.5"
          >
            GitHub repo URL
          </label>
          <RepoSelector onSelectionChange={setHasRepo} />
          <p className="text-[11px] text-foreground-muted mt-1">
            Public or private — your repo stays private from the giver until
            they release payment.
          </p>
        </div>

        <div>
          <label
            htmlFor="writeup"
            className="block text-xs text-foreground-muted mb-1.5"
          >
            Explain your approach
          </label>
          <textarea
            id="writeup"
            name="writeup"
            required
            minLength={30}
            rows={4}
            placeholder="What did you build? What approach did you take? Any known limitations or tradeoffs worth the giver knowing before they review the output?"
            className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors resize-y"
          />
        </div>

        <button
          type="submit"
          disabled={pending || !hasRepo}
          className="self-start rounded-md bg-primary text-background font-medium px-6 py-2.5 text-sm hover:bg-primary/80 transition-colors disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit solution"}
        </button>
      </form>
    </div>
  );
}