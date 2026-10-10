import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { syncUserFromSupabase } from "./sync-user";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Ensure a Prisma User row exists/updated for this Supabase user.
  // @ts-ignore
  await syncUserFromSupabase(user, user?.provider_token, user?.user_metadata?.login);

  return prisma.user.findUnique({ where: { id: user.id } });
}

export async function requireCurrentUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Not authenticated");
  return u;
}
