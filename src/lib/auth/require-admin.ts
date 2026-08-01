import { createClient } from "@/lib/supabase/server";

/**
 * v1 admin gating: a comma-separated email allowlist in ADMIN_EMAILS.
 * No dedicated admin role in the schema yet — this is intentionally the
 * simplest thing that works for a single-operator payout queue. If this
 * platform grows a real admin team, replace with a proper role/permission
 * check backed by the DB instead of an env var.
 */
export async function requireAdmin(): Promise<{ email: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowlist.includes(user.email.toLowerCase())) return null;

  return { email: user.email };
}
