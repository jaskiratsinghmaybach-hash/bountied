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
          availableBalance: true,
        },
      })
    : null;

  const isGiver = profile?.role === "GIVER";
  const showBalance = !!profile && (profile.role === "GIVER" || profile.role === "SOLVER" || profile.role === "BOTH");
  // Givers have a wallet balance. Solvers see deposited credit plus available
  // earnings, matching the balance used by the solver-test charging logic.
  const balance = !profile ? 0 : isGiver
    ? Number(profile.creditBalance)
    : Number(profile.creditBalance) + Number(profile.availableBalance);
  const balanceHref = isGiver ? "/dashboard/giver/wallet" : "/dashboard/solver/funds";
  const balanceLabel = isGiver ? "Wallet balance" : "Total balance";

  // Fetched here, not inside HeaderNotifications, so this stays a single
  // server-rendered query instead of a second client-side fetch on every
  // page mount — Header already renders on every page, so this rides
  // along with the profile lookup above rather than adding a separate
  // round trip.
  const notifications = user
    ? await prisma.notification.findMany({
        where: { recipientId: user.id },
        include: {
          sender: { select: { name: true } },
          // submission.problemId is what lets a click on the notification
          // take the recipient straight to the bounty page it's about
          // (product decision 2026-09-30) — a platform notification with
          // no submissionId simply has no link, which the UI treats as
          // "not clickable" rather than erroring.
          submission: { select: { problemId: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      })
    : [];

  return (
    <FixedHeader>
      <Link href="/" className="font-mono font-semibold text-foreground tracking-tight">
        bountied<span className="text-foreground">.</span>
      </Link>

      <nav className="flex items-center gap-1 sm:gap-2">
        {user ? (
          <>
            {showBalance ? (
              <Link
                href={balanceHref}
                className="flex items-center gap-1.5 px-2 py-1 text-xs text-foreground-muted transition-colors hover:text-foreground sm:text-sm"
                title={balanceLabel}
                aria-label={`${balanceLabel}: $${balance.toFixed(2)}`}
              >
                <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="tabular-nums">${balance.toFixed(2)}</span>
              </Link>
            ) : null}
            <HeaderNotifications notifications={notifications} />
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
