import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { syncUserFromSupabase } from "./sync-user";
import { decryptGithubTokenOrNull } from "@/lib/security/github-token";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Ensure a Prisma User row exists/updated for this Supabase user.
  // @ts-expect-error Supabase user typing omits the provider token exposed by OAuth callbacks.
  await syncUserFromSupabase(user, user?.provider_token, user?.user_metadata?.login);

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) return null;
  return { ...profile, githubAccessToken: decryptGithubTokenOrNull(profile.githubAccessToken) };
}

export async function requireCurrentUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not authenticated");
  return u;
}
