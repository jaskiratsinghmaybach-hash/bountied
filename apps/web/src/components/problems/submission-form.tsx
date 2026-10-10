"use client";

import { useActionState, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { Terminal, TriangleAlert } from "lucide-react";
import {
  createSubmission,
  // @ts-ignore
  type CreateSubmissionResult,
} from "@/lib/problems/submission-actions";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { RepoSelector } from "./repo-selector";

// @ts-ignore
const initialState: CreateSubmissionResult | undefined = undefined;

export function SubmissionForm({
  problemId,
  githubConnected,
}: {
  problemId: string;
  githubConnected: boolean;
}) {
  // @ts-ignore
  const boundAction = createSubmission.bind(null, problemId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [hasRepo, setHasRepo] = useState(false);

  if (state && "ok" in state) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center gap-2 mb-2">
          <Terminal size={16} className="text-foreground" />
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
        Your repo will be cloned and run in an isolated sandbox. The giver
        sees only the captured terminal output — not your source code.
      </p>

      {state && "error" in state && (
        <Alert variant="destructive" className="mb-4">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
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
          <Textarea
            id="writeup"
            name="writeup"
            required
            minLength={30}
            rows={4}
            placeholder="What did you build? What approach did you take? Any known limitations or tradeoffs worth the giver knowing before they review the output?"
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
      </form>
    </div>
  );
}
