"use client";

/**
 * TEMPORARY — delete this whole file (and lib/auth/unlink-stale-github-TEMP.ts)
 * after you've cleaned up your affected test accounts.
 *
 * Visit this page WHILE SIGNED IN as the account that has a stale GitHub
 * link (one where githubAccessToken is NULL in the User table despite
 * GitHub showing as a linked provider). Click the button once, then go
 * click "Connect GitHub" again on a problem page — it'll go through the
 * now-fixed flow and actually capture the token this time.
 */

import { useState } from "react";
import { unlinkStaleGithubIdentity } from "@/lib/auth/unlink-stale-github-TEMP";

export default function TempUnlinkGithubPage() {
  const [result, setResult] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    const res = await unlinkStaleGithubIdentity();
    setPending(false);
    setResult("ok" in res ? "Unlinked successfully. Now go click Connect GitHub again." : res.error);
  }

  return (
    <main className="px-8 py-10 max-w-md">
      <h1 className="text-lg font-semibold text-foreground mb-2">
        Temporary: Unlink stale GitHub identity
      </h1>
      <p className="text-sm text-foreground-muted mb-6">
        Only use this on the account currently signed in. Delete this page after use.
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md bg-primary text-background font-medium px-5 py-2.5 text-sm hover:bg-primary/80 transition-colors disabled:opacity-60"
      >
        {pending ? "Working…" : "Unlink GitHub from this account"}
      </button>
      {result && <p className="text-sm text-foreground-muted mt-4">{result}</p>}
    </main>
  );
}
