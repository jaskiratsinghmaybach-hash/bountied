import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for server-side Storage reads/writes that bypass RLS
 * after this app has already enforced its own auth checks (e.g. signed URL
 * generation for solvers viewing OPEN bounty screenshots).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in env. Returns null when unset.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
