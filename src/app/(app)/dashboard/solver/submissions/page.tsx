import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

const statusLabel: Record<string, { label: string; color: string }> = {
  SUBMITTED: { label: "Submitted", color: "text-foreground-muted" },
  UNDER_REVIEW: { label: "Under review", color: "text-money" },
  ACCEPTED: { label: "Accepted", color: "text-accent" },
  REJECTED: { label: "Rejected", color: "text-danger" },
};

export default async function SolverSubmissionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");
  if (profile.role === "GIVER") redirect("/dashboard/giver");
  if (!profile.role) redirect("/onboarding");

  const submissions = await prisma.submission.findMany({
    where: { solverId: user.id },
    include: { problem: true },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <main className="px-8 py-10 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">My submissions</h1>

      {submissions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-foreground-muted mb-4">
            You haven&apos;t submitted anything yet.
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
          {submissions.map((s) => {
            const status = statusLabel[s.status] ?? statusLabel.SUBMITTED;
            return (
              <Link
                key={s.id}
                href={`/problems/${s.problemId}`}
                className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between hover:border-foreground-muted transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{s.problem.title}</p>
                  <p className={`text-xs mt-1 font-mono ${status.color}`}>{status.label}</p>
                </div>
                <span className="text-xs font-mono text-money">
                  {s.problem.bountyAmount ? `$${s.problem.bountyAmount}` : "Free"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}