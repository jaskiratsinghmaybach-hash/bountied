"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * TEMPORARY, ONE-TIME UTILITY — delete this file once you've used it.
 *
 * Purpose: a small number of test accounts got GitHub linked via
 * linkIdentity() BEFORE the fragment-based-response bug (see
 * oauth-fragment-handler.tsx) was fixed. Their GitHub identity is
 * genuinely linked in Supabase Auth, but githubAccessToken never got
 * captured into the Prisma User row, because the response arrived via
 * URL fragment and the server-side callback route couldn't see it.
 *
 * Re-running linkIdentity() on an already-linked provider just fails
 * with identity_already_exists — it won't re-issue a token. The only way
 * to get a fresh linkIdentity() flow (and therefore a fresh, capturable
 * token) is to unlink first, then link again through the NOW-FIXED flow.
 *
 * Usage: call this once for your affected test account (must be signed
 * in as that account), then immediately go click "Connect GitHub" again
 * — it will now go through cleanly and the fix will capture the token.
 */
export async function unlinkStaleGithubIdentity(): Promise<
  { ok: true } | { error: string }
> {
  const supabase = await createClient();

  const { data, error: listError } = await supabase.auth.getUserIdentities();

  if (listError) return { error: listError.message };

  const identities = data?.identities ?? [];
  const githubIdentity = identities.find(
    (i: { provider: string }) => i.provider === "github"
  );
  if (!githubIdentity) {
    return { error: "No GitHub identity found on this account." };
  }
  if (identities.length < 2) {
    return {
      error:
        "This account only has one linked identity — unlinking would lock you out. Aborting.",
    };
  }

  const { error: unlinkError } = await supabase.auth.unlinkIdentity(githubIdentity);
  if (unlinkError) return { error: unlinkError.message };

  return { ok: true };
}