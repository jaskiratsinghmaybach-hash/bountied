import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import type { ProblemStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const statusLabel: Record<string, { label: string; dot: string }> = {
  DRAFT: { label: "Draft", dot: "bg-foreground-muted" },
  FUNDED: { label: "Funded", dot: "bg-success" },
  OPEN: { label: "Open", dot: "bg-success" },
  IN_REVIEW: { label: "In review", dot: "bg-foreground-muted" },
  COMPLETED: { label: "Completed", dot: "bg-success" },
  CANCELLED: { label: "Cancelled", dot: "bg-danger" },
  REFUNDED: { label: "Refunded", dot: "bg-foreground-muted" },
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
    <main className="px-8 pb-10 max-w-4xl">
      <div className="sticky top-0 bg-background z-20 pt-10 pb-6 -mx-8 px-8 border-b border-border/20">
        <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">My problems</h1>
          <p className="text-sm text-foreground-muted">
            Every problem you&apos;ve posted, and where it stands.
          </p>
        </div>
        <Button asChild>
          <Link href="/problems/new" className="gap-2 shrink-0">
            <PlusCircle size={16} />
            Post a problem
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {filterTabs.map((tab) => {
          const isActive = tab.value === "ALL" ? !activeFilter : activeFilter === tab.value;
          return (
            <Link
              key={tab.value}
              href={tab.value === "ALL" ? "/dashboard/giver/problems" : `/dashboard/giver/problems?status=${tab.value}`}
              className={cn(
                "text-xs font-mono px-3 py-1.5 rounded-md border transition-colors",
                isActive
                  ? "border-2 border-border-strong bg-foreground text-background font-medium"
                  : "border-border text-foreground-muted hover:text-foreground hover:bg-surface"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
        </div>
      </div>

      <div className="pt-6">

      {problems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-foreground-muted mb-4">
            {activeFilter
              ? "No problems match this filter."
              : "You haven't posted a problem yet. Fund a bounty and get it in front of solvers today."}
          </p>
          <Button asChild>
            <Link href="/problems/new">Post your first problem</Link>
          </Button>
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
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    <p className="text-xs font-mono text-foreground-muted">
                      {s.label} · {p._count.submissions} submission{p._count.submissions === 1 ? "" : "s"}
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