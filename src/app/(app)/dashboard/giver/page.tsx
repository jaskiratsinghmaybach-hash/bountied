import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Briefcase, Clock, DollarSign, PlusCircle, Wallet } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";

const statusLabel: Record<string, { label: string; dot: string }> = {
  DRAFT: { label: "Draft", dot: "bg-foreground-muted" },
  FUNDED: { label: "Funded", dot: "bg-success" },
  OPEN: { label: "Open", dot: "bg-success" },
  IN_REVIEW: { label: "In review", dot: "bg-foreground-muted" },
  COMPLETED: { label: "Completed", dot: "bg-success" },
  CANCELLED: { label: "Cancelled", dot: "bg-danger" },
  REFUNDED: { label: "Refunded", dot: "bg-foreground-muted" },
};

export default async function GiverDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");

  // This page is GIVER-only. Someone who picked SOLVER (or hasn't picked
  // yet) typing /dashboard/giver directly gets sent to where they
  // actually belong — never shown content meant for a different role.
  // BOTH-role users are allowed here since Giver is one of their two
  // real views (see sidebar.tsx comment on the BOTH plan).
  if (profile.role === "SOLVER") redirect("/dashboard/solver");
  if (!profile.role) redirect("/onboarding");

  const problems = await prisma.problem.findMany({
    where: { giverId: user.id },
    include: {
      _count: { select: { submissions: true } },
      escrow: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const activeCount = problems.filter((p) =>
    ["OPEN", "IN_REVIEW", "FUNDED"].includes(p.status)
  ).length;

  const totalFunded = problems.reduce(
    (sum, p) => sum + (p.escrow ? Number(p.escrow.amount) : 0),
    0
  );

  const pendingReview = problems.reduce((sum, p) => sum + p._count.submissions, 0);

  return (
    <main className="px-8 pb-10 max-w-4xl">
      <div className="sticky top-0 bg-background z-20 pt-10 pb-4 -mx-8 px-8 border-b border-border/20">
        <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">
            Welcome back, {profile.name}
          </h1>
          <p className="text-sm text-foreground-muted">
            Manage the bounties you&apos;ve posted and review submissions.
          </p>
        </div>
        <Button asChild>
          <Link href="/problems/new" className="gap-2">
            <PlusCircle size={16} />
            Post a bounty
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <StatCard
          label="Credit balance"
          value={`$${Number(profile.creditBalance).toFixed(2)}`}
          icon={Wallet}
        />
        <StatCard label="Active problems" value={String(activeCount)} icon={Briefcase} />
        <StatCard
          label="Total in escrow"
          value={`$${totalFunded.toFixed(2)}`}
          icon={DollarSign}
        />
        <StatCard label="Submissions to review" value={String(pendingReview)} icon={Clock} />
      </div>

      <div className="flex items-center justify-between mt-6">
        <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide">
          Your bounties
        </h2>
        <Link href="/dashboard/giver/problems" className="text-sm text-foreground-muted hover:text-foreground hover:underline">
          View all →
        </Link>
      </div>
    </div>

    <div className="pt-6">

        {problems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-sm text-foreground-muted mb-4">
              You haven&apos;t posted a bounty yet. Fund a bounty and get it
              in front of solvers today.
            </p>
            <Button asChild>
              <Link href="/problems/new">Post your first bounty</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {problems.map((p) => {
              const status = statusLabel[p.status] ?? statusLabel.DRAFT;
              return (
                <Link
                  key={p.id}
                  href={`/dashboard/giver/problems/${p.id}`}
                  className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between hover:border-foreground-muted transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      <p className="text-xs font-mono text-foreground-muted">
                        {status.label} · {p._count.submissions} submission{p._count.submissions === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-mono font-medium text-foreground">
                    {p.bountyAmount ? `$${p.bountyAmount}` : "Free"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
