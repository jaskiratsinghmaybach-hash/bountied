import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Briefcase, Clock, DollarSign, PlusCircle } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";

const statusLabel: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "text-foreground-muted" },
  FUNDED: { label: "Funded", color: "text-money" },
  OPEN: { label: "Open", color: "text-accent" },
  IN_REVIEW: { label: "In review", color: "text-money" },
  COMPLETED: { label: "Completed", color: "text-foreground-muted" },
  CANCELLED: { label: "Cancelled", color: "text-danger" },
  REFUNDED: { label: "Refunded", color: "text-foreground-muted" },
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
    <main className="px-8 py-10 max-w-4xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">
            Welcome back, {profile.name}
          </h1>
          <p className="text-sm text-foreground-muted">
            Manage the problems you&apos;ve posted and review submissions.
          </p>
        </div>
        <Link
          href="/problems/new"
          className="flex items-center gap-2 rounded-md bg-accent text-background font-medium px-4 py-2.5 text-sm hover:bg-accent-dim transition-colors shrink-0"
        >
          <PlusCircle size={16} />
          Post a problem
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10">
        <StatCard label="Active problems" value={String(activeCount)} icon={Briefcase} />
        <StatCard
          label="Total in escrow"
          value={`$${totalFunded.toFixed(2)}`}
          icon={DollarSign}
          accent
        />
        <StatCard label="Submissions to review" value={String(pendingReview)} icon={Clock} />
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
  <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide">
    Your problems
  </h2>
  <Link href="/dashboard/giver/problems" className="text-sm text-accent hover:underline">
    View all →
  </Link>
</div>

        {problems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-sm text-foreground-muted mb-4">
              You haven&apos;t posted a problem yet. Fund a bounty and get it
              in front of solvers today.
            </p>
            <Link
              href="/problems/new"
              className="inline-block rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors"
            >
              Post your first problem
            </Link>
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
                    <p className={`text-xs mt-1 font-mono ${status.color}`}>
                      {status.label} · {p._count.submissions} submission
                      {p._count.submissions === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-money">
                    {p.bountyAmount ? `$${p.bountyAmount}` : "Free"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
