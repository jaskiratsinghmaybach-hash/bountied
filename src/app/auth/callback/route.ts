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

      // Ensure a Prisma User row exists before sending them into the app.
      await syncUserFromSupabase(data.user);

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
