import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { FixedHeader } from "./fixed-header";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <FixedHeader>
      <Link href="/" className="font-mono font-semibold text-foreground tracking-tight">
        bountied<span className="text-accent">.</span>
      </Link>

      <nav className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm text-foreground-muted hover:text-foreground transition-colors px-3 py-2"
              >
                Dashboard
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-md border border-border text-foreground text-sm font-medium px-4 py-2 hover:bg-surface transition-colors"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm text-foreground-muted hover:text-foreground transition-colors px-3 py-2"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-accent text-background text-sm font-medium px-4 py-2 hover:bg-accent-dim transition-colors"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
    </FixedHeader>
  );
}
