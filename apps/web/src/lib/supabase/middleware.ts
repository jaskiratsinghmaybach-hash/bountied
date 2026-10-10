import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request and redirects
 * unauthenticated users away from protected routes.
 *
 * This MUST run on every request that touches auth state, which is why
 * it lives in middleware.ts rather than being called ad-hoc in pages —
 * Supabase's session tokens expire and need silent refreshing, and
 * middleware is the only place that can rewrite the response cookies
 * before the page itself renders.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not remove this. getUser() validates the session against
  // Supabase's servers (unlike getSession(), which just reads the local
  // cookie and can be stale/spoofed client-side). This is the actual
  // authentication check.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/onboarding") ||
    request.nextUrl.pathname.startsWith("/problems/new") ||
    request.nextUrl.pathname.startsWith("/settings");

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup");

  if (!user && isProtectedRoute) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // IMPORTANT: supabaseResponse must be returned as-is. If you need to
  // create a new response, copy the cookies from supabaseResponse onto it,
  // or the session refresh will silently break.
  return supabaseResponse;
}
