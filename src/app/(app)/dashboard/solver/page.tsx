import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Trophy, Wallet, Target, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { PayoutWarningBanner } from "@/components/payments/payout-warning-banner";

export default async function SolverDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");

  // This page is SOLVER-only. Someone who picked GIVER (or hasn't picked
  // yet) typing /dashboard/solver directly gets sent to where they
  // actually belong — never shown content meant for a different role.
  // BOTH-role users are allowed here since Solver is one of their two
  // real views (see sidebar.tsx comment on the BOTH plan).
  if (profile.role === "GIVER") redirect("/dashboard/giver");
  if (!profile.role) redirect("/onboarding");

  // Active submissions: ones not yet resolved either way.
  const activeSubmissions = await prisma.submission.findMany({
    where: {
      solverId: user.id,
      status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
    },
    include: { problem: true },
    orderBy: { submittedAt: "desc" },
    take: 5,
  });

  return (
    <main className="px-8 py-10 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">
          Welcome back, {profile.name}
        </h1>
        <p className="text-sm text-foreground-muted">
          Here&apos;s where things stand across your bounty work.
        </p>
      </div>

      <PayoutWarningBanner bankDetailsAdded={profile.bankDetailsAdded} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <StatCard
          label="Available balance"
          value={`$${Number(profile.availableBalance).toFixed(2)}`}
          icon={Wallet}
          accent
        />
        <StatCard
          label="Total earned"
          value={`$${Number(profile.totalEarned).toFixed(2)}`}
          icon={Trophy}
        />
        <StatCard
          label="Rating"
          value={profile.rating > 0 ? profile.rating.toFixed(1) : "—"}
          icon={TrendingUp}
        />
        <StatCard
          label="Accuracy"
          value={profile.accuracyRate ? `${Math.round(profile.accuracyRate * 100)}%` : "—"}
          icon={Target}
        />
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide">
            Active submissions
          </h2>
          <Link href="/problems" className="text-sm text-accent hover:underline">
            Browse open bounties →
          </Link>
        </div>

        {activeSubmissions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-sm text-foreground-muted mb-4">
              You haven&apos;t submitted to anything yet. Find a bounty that
              matches your skills and give it a shot.
            </p>
            <Link
              href="/problems"
              className="inline-block rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors"
            >
              Browse open bounties
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeSubmissions.map((s) => (
              <Link
                key={s.id}
                href={`/problems/${s.problemId}`}
                className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between hover:border-foreground-muted transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{s.problem.title}</p>
                  <p className="text-xs text-foreground-muted mt-1">
                    Submitted {s.submittedAt.toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs font-mono text-money">
                  {s.problem.bountyAmount ? `$${s.problem.bountyAmount}` : "Free"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
