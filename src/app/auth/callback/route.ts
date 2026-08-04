import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncUserFromSupabase } from "@/lib/auth/sync-user";
import { prisma } from "@/lib/db";

/**
 * GitHub/Google send the user here after they approve login, with a `code`
 * param that we exchange for a real session. Configure this exact URL
 * (https://yourdomain.com/auth/callback, and http://localhost:3000/auth/callback
 * for local dev) in both:
 *   - Supabase Dashboard -> Authentication -> URL Configuration
 *   - Each OAuth provider's app settings (GitHub OAuth App, Google Cloud Console)
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Password-recovery emails link here with ?next=/reset-password — that
  // takes priority over the normal onboarding/dashboard routing below,
  // since the user's whole reason for being here is to set a password,
  // not to browse the app yet.
  const next = searchParams.get("next");
  // Only honor an explicit redirectedFrom for already-onboarded users;
  // first-time OAuth users always go through /onboarding first (decided below).
  const explicitRedirect = searchParams.get("redirectedFrom");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (next === "/reset-password") {
        return NextResponse.redirect(`${origin}/reset-password`);
      }

      // GitHub carries a provider_token here when the repo scope was
      // granted — either from a fresh GitHub sign-in (oauth-buttons.tsx)
      // or from linkIdentity() adding GitHub to an account that
      // originally signed up a different way (connect-github-prompt.tsx).
      // This is the only point in the whole auth flow where Supabase
      // hands it to us; it is NOT persisted by Supabase itself and is
      // lost on session refresh, so it must be captured and stored here.
      //
      // IMPORTANT: check app_metadata.providers (plural, an array of every
      // linked provider), NOT app_metadata.provider (singular — the
      // user's ORIGINAL sign-up method, which never changes after linking
      // a second identity). Checking the singular field would silently
      // fail to capture the token for anyone who links GitHub after
      // signing up via email/password or Google — exactly the accounts
      // that most need this to work.
      const providers = (data.user.app_metadata?.providers as string[] | undefined) ?? [];
      const githubToken = providers.includes("github")
        ? data.session?.provider_token ?? undefined
        : undefined;

      // Ensure a Prisma User row exists before sending them into the app.
      await syncUserFromSupabase(data.user, githubToken);

      const profile = await prisma.user.findUnique({ where: { id: data.user.id } });
      const destination = profile?.role
        ? (explicitRedirect ?? "/dashboard")
        : "/onboarding";

      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  // Something went wrong — send them back to login with an error flag
  // rather than a broken/blank page.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}