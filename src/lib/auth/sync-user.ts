import { prisma } from "@/lib/db";
import type { User as SupabaseUser } from "@supabase/supabase-js";

/**
 * Ensures a Prisma User row exists for a given Supabase Auth user.
 *
 * Supabase Auth and your Prisma `User` table are two separate systems:
 * Supabase owns login/password/OAuth/session tokens, Prisma's User table
 * owns platform data (rating, badges, earnings, problems posted). This
 * function is the bridge — call it right after a successful sign-up/login
 * (in the OAuth callback route and the email/password sign-up action) so
 * every authenticated Supabase user has a matching row here.
 *
 * Uses upsert so it's safe to call on every login, not just the first one —
 * cheap no-op if the row already exists.
 *
 * githubAccessToken: only passed when this call is following a GitHub
 * OAuth login/link AND Supabase actually returned a provider_token on this
 * exchange (it doesn't always — repeat logins within an existing browser
 * session sometimes skip re-issuing it). When present, it OVERWRITES any
 * previously stored token, which is correct — a fresh token is always
 * preferable to a possibly-stale one. When absent, the existing stored
 * token (if any) is left untouched rather than wiped, so a solver's repo
 * access doesn't silently break just because a later login didn't
 * include a fresh token.
 *
 * githubUsername: same "only overwrite when present" treatment as the
 * token above. Used by GIVERS — the collaborator-invite API that grants
 * post-payment repo access (see lib/github/grant-access.ts) needs a
 * GitHub login, not a token. A giver only ever needs to connect once;
 * after this is set, the "Connect GitHub" prompt never shows again for
 * them on any future accepted submission.
 */
export async function syncUserFromSupabase(
  supabaseUser: SupabaseUser,
  githubAccessToken?: string,
  githubUsername?: string
) {
  const email = supabaseUser.email;
  if (!email) {
    throw new Error(
      `Supabase user ${supabaseUser.id} has no email — cannot sync to Prisma User table`
    );
  }

  // Pull a display name from whatever the OAuth provider gave us,
  // falling back to the email's local part for email/password sign-ups.
  const name =
    (supabaseUser.user_metadata?.full_name as string | undefined) ??
    (supabaseUser.user_metadata?.name as string | undefined) ??
    email.split("@")[0];

  const avatarUrl =
    (supabaseUser.user_metadata?.avatar_url as string | undefined) ?? null;

  return prisma.user.upsert({
    where: { id: supabaseUser.id },
    update: {
      // Keep email/name/avatar in sync in case they change at the provider,
      // but never touch rating/earnings/etc. here — those are platform-owned.
      email,
      name,
      avatarUrl,
      ...(githubAccessToken
        ? { githubAccessToken, githubConnected: true }
        : {}),
      ...(githubUsername ? { githubUsername } : {}),
    },
    create: {
      id: supabaseUser.id,
      email,
      name,
      avatarUrl,
      ...(githubAccessToken
        ? { githubAccessToken, githubConnected: true }
        : {}),
      ...(githubUsername ? { githubUsername } : {}),
    },
  });
}
