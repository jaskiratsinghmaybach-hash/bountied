import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { FixedHeader } from "./fixed-header";
import { Button } from "@/components/ui/button";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <FixedHeader>
      <Link href="/" className="font-mono font-semibold text-foreground tracking-tight">
        bountied<span className="text-foreground">.</span>
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
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="border-border text-foreground hover:bg-surface"
                >
                  Sign out
                </Button>
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
              <Button asChild size="sm">
                <Link href="/signup">
                  Sign up
                </Link>
              </Button>
            </>
          )}
        </nav>
    </FixedHeader>
  );
}
