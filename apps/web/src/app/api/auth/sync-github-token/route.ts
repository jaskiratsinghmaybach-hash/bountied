import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncUserFromSupabase } from "@/lib/auth/sync-user";

/**
 * Called by OAuthFragmentHandler after a fragment-based OAuth response
 * (see that component for why this exists — Supabase's server-side
 * /auth/callback route cannot see URL fragments at all, by HTTP/OAuth
 * spec, so this is the only place a fragment-delivered GitHub token can
 * actually get captured into the Prisma User row).
 *
 * SECURITY: deliberately does NOT trust anything in the request body.
 * A client could put any value it wants in a POST body — the body here
 * exists only as a trigger signal, not as a data source. The real
 * session (and its real provider_token, if any) is re-derived server-side
 * from the request's own cookies, via createClient()/getSession(), the
 * exact same trust boundary the main /auth/callback route uses.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "No active session" }, { status: 401 });
  }

  // Same providers-array check as /auth/callback/route.ts — see that
  // file's comment for why this must be the plural array, not the
  // singular original-signup-method field.
  const providers =
    (session.user.app_metadata?.providers as string[] | undefined) ?? [];
  const githubToken = providers.includes("github")
    ? session.provider_token ?? undefined
    : undefined;

  await syncUserFromSupabase(session.user, githubToken);

  return NextResponse.json({ ok: true, githubCaptured: !!githubToken });
}
