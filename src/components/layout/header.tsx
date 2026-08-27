import Link from "next/link";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { FixedHeader } from "./fixed-header";
import { Button } from "@/components/ui/button";
import { HeaderAccountMenu } from "./header-account-menu";
import { HeaderNotifications } from "./header-notifications";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = user
    ? await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          name: true,
          email: true,
          role: true,
          avatarUrl: true,
          creditBalance: true,
        },
      })
    : null;

  const showCreditBalance =
    profile?.role === "GIVER" || profile?.role === "BOTH";
  const creditBalance = profile ? Number(profile.creditBalance) : 0;

  return (
    <FixedHeader>
      <Link href="/" className="font-mono font-semibold text-foreground tracking-tight">
        bountied<span className="text-foreground">.</span>
      </Link>

      <nav className="flex items-center gap-1 sm:gap-2">
        {user ? (
          <>
            {showCreditBalance ? (
              <Link
                href="/dashboard/giver/wallet"
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-foreground-muted transition-colors hover:text-foreground sm:text-sm"
                title="Wallet balance"
              >
                <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="tabular-nums">${creditBalance.toFixed(2)}</span>
              </Link>
            ) : null}
            <HeaderNotifications />
            <HeaderAccountMenu
              name={profile?.name ?? ""}
              email={profile?.email ?? user.email ?? ""}
              role={profile?.role ?? null}
              avatarUrl={profile?.avatarUrl ?? null}
            />
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
              <Link href="/signup">Sign up</Link>
            </Button>
          </>
        )}
      </nav>
    </FixedHeader>
  );
}
