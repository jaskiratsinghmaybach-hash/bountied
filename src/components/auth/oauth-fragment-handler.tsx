"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Supabase's linkIdentity() (and some other OAuth flows) can return the
 * user via a URL FRAGMENT (#access_token=..., or #error=...) rather than
 * a ?code= query param. Fragments are a browser-only concept — per the
 * OAuth spec, they are NEVER sent to the server, so src/app/auth/callback
 * /route.ts (server-side, reads searchParams only) structurally cannot
 * see or handle them. This is why a successful GitHub link could still
 * leave githubAccessToken NULL in the DB: the token arrived in a
 * fragment, the server-side sync code never ran, and the client-side
 * Supabase SDK silently established the session on its own without our
 * app ever getting a chance to capture the GitHub token from it.
 *
 * This component runs once on mount wherever it's placed (mount it high,
 * e.g. in the (app) layout) and:
 *   1. If the fragment contains an error (e.g. identity_already_exists),
 *      shows it clearly instead of a silent failure.
 *   2. If the fragment contains a real session, calls a sync endpoint so
 *      the GitHub token still gets captured server-side, then cleans the
 *      fragment out of the URL so it doesn't linger/resurface on refresh.
 */
export function OAuthFragmentHandler() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;

    const params = new URLSearchParams(hash.slice(1)); // strip leading '#'
    const errorDescription = params.get("error_description");
    const errorCode = params.get("error_code");
    const accessToken = params.get("access_token");

    if (!errorDescription && !accessToken) return; // nothing relevant in the fragment

    // Wrapped in an async IIFE (even the error branch, which has no real
    // await) so React never sees setState called synchronously within the
    // effect's initial pass — that's what triggers React 19's "calling
    // setState synchronously within an effect" warning. Awaiting
    // Promise.resolve() is enough to push the state update to a
    // microtask, genuinely outside the effect's synchronous execution.
    (async () => {
      if (errorDescription) {
        await Promise.resolve();
        // identity_already_exists is expected/benign — the identity
        // really is already linked, nothing to fix, just don't show it
        // as scary.
        if (errorCode === "identity_already_exists") {
          setError("This GitHub account is already connected.");
        } else {
          setError(errorDescription.replace(/\+/g, " "));
        }
        // Clean the fragment so a page refresh doesn't re-show the same error.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        return;
      }

      // A real session arrived via fragment. The client SDK processes the
      // fragment asynchronously to establish the session (detectSessionInUrl
      // defaults to true) — but that alone does NOT run our server-side
      // sync/token-capture logic, and there's a real race: this effect can
      // run before the SDK has finished. Retry briefly rather than checking
      // once and silently giving up.
      const supabase = createClient();
      let session = null;
      for (let attempt = 0; attempt < 5 && !session; attempt++) {
        const { data } = await supabase.auth.getSession();
        session = data.session;
        if (!session) await new Promise((r) => setTimeout(r, 300));
      }
      if (!session) return; // gave up — user can retry the connect action manually

      await fetch("/api/auth/sync-github-token", { method: "POST" });

      // Clean the fragment out of the URL now that we're done with it.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    })();
  }, []);

  if (!error) return null;

  return (
    <div className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger mb-4">
      {error}
    </div>
  );
}