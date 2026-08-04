"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FaGithub } from "react-icons/fa";
import { TriangleAlert } from "lucide-react";

/**
 * Shown wherever a solver needs GitHub repo access but doesn't have it yet
 * (signed up via email/Google, or a previously-granted token went stale).
 * Uses linkIdentity for an already-logged-in user rather than
 * signInWithOAuth, which would attempt a fresh sign-in instead of adding
 * GitHub access to the current account — signInWithOAuth while already
 * logged in can silently switch the session to a different Supabase user
 * if the browser's GitHub session belongs to someone else.
 *
 * Requires "Enable Manual Linking" turned on in the Supabase dashboard's
 * Auth settings — linkIdentity fails otherwise (surfaced as an error
 * below, not a silent no-op).
 */
export function ConnectGithubPrompt({ reason }: { reason?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleConnect() {
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: "github",
      options: {
        scopes: "repo",
        redirectTo: `${window.location.origin}/auth/callback?redirectedFrom=${encodeURIComponent(window.location.pathname)}`,
      },
    });

    if (linkError) {
      setPending(false);
      setError(linkError.message);
    }
    // On success, linkIdentity redirects the browser to GitHub —
    // this component unmounts, no further state update needed.
  }

  return (
    <div className="rounded-lg border border-money/30 bg-money/5 p-5 flex items-start gap-4">
      <FaGithub size={20} className="text-foreground shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm text-foreground mb-1">Connect GitHub to submit</p>
        <p className="text-xs text-foreground-muted mb-3">
          {reason ??
            "Submissions run from a private GitHub repo. Connect your account so we can access it — the giver never sees your code directly, only what the sandbox outputs."}
        </p>

        {error && (
          <div className="flex items-start gap-2 mb-3 text-xs text-danger">
            <TriangleAlert size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleConnect}
          disabled={pending}
          className="flex items-center gap-2 rounded-md bg-accent text-background font-medium px-4 py-2 text-sm hover:bg-accent-dim transition-colors disabled:opacity-60"
        >
          <FaGithub size={14} />
          {pending ? "Redirecting…" : "Connect GitHub"}
        </button>
      </div>
    </div>
  );
}