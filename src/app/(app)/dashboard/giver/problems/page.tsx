import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import type { ProblemStatus } from "@prisma/client";

const statusLabel: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "text-foreground-muted" },
  FUNDED: { label: "Funded", color: "text-money" },
  OPEN: { label: "Open", color: "text-accent" },
  IN_REVIEW: { label: "In review", color: "text-money" },
  COMPLETED: { label: "Completed", color: "text-foreground-muted" },
  CANCELLED: { label: "Cancelled", color: "text-danger" },
  REFUNDED: { label: "Refunded", color: "text-foreground-muted" },
};

const filterTabs: { value: ProblemStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DRAFT", label: "Draft" },
];

export default async function GiverProblemsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");
  if (profile.role === "SOLVER") redirect("/dashboard/solver");
  if (!profile.role) redirect("/onboarding");

  const activeFilter = status as ProblemStatus | undefined;

  const problems = await prisma.problem.findMany({
    where: {
      giverId: user.id,
      ...(activeFilter ? { status: activeFilter } : {}),
    },
    include: {
      _count: { select: { submissions: true } },
      escrow: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="px-8 py-10 max-w-4xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">My problems</h1>
          <p className="text-sm text-foreground-muted">
            Every problem you&apos;ve posted, and where it stands.
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

      <div className="flex flex-wrap gap-2 mb-6">
        {filterTabs.map((tab) => {
          const isActive = tab.value === "ALL" ? !activeFilter : activeFilter === tab.value;
          return (
            <Link
              key={tab.value}
              href={tab.value === "ALL" ? "/dashboard/giver/problems" : `/dashboard/giver/problems?status=${tab.value}`}
              className={`text-xs font-mono px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "border-accent text-accent bg-surface-raised"
                  : "border-border text-foreground-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {problems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-foreground-muted mb-4">
            {activeFilter
              ? "No problems match this filter."
              : "You haven't posted a problem yet. Fund a bounty and get it in front of solvers today."}
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
            const s = statusLabel[p.status] ?? statusLabel.DRAFT;
            return (
              <Link
                key={p.id}
                href={`/dashboard/giver/problems/${p.id}`}
                className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between hover:border-foreground-muted transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{p.title}</p>
                  <p className={`text-xs mt-1 font-mono ${s.color}`}>
                    {s.label} · {p._count.submissions} submission
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
    </main>
  );
}