import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Use this in Server Components, Route Handlers, and Server Actions.
 * Must be called fresh (awaited) each time — it reads the current
 * request's cookies to figure out who's logged in.
 *
 * Do NOT reuse a single instance across requests, unlike the Prisma
 * client singleton pattern — this one is request-scoped by design.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll was called from a Server Component, which can't set
            // cookies directly. This is safe to ignore IF you have
            // middleware refreshing the session (see middleware.ts) —
            // the middleware's response is what actually persists the
            // refreshed session cookie back to the browser.
          }
        },
      },
    }
  );
}
