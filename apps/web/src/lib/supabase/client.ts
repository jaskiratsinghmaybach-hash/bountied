import { createBrowserClient } from "@supabase/ssr";

/**
 * Use this in Client Components ("use client" files) — login forms,
 * signup forms, anything that runs in the browser and needs to call
 * supabase.auth.signInWithPassword(), signInWithOAuth(), etc.
 *
 * For Server Components / Route Handlers / Server Actions, use
 * src/lib/supabase/server.ts instead — cookies work differently there.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
