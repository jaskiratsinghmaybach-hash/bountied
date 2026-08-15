import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const statusLabel: Record<string, { label: string; dot: string }> = {
  SUBMITTED: { label: "Submitted", dot: "bg-foreground-muted" },
  RUNNING: { label: "Running in sandbox…", dot: "bg-foreground-muted" },
  SANDBOX_FAILED: { label: "Sandbox failed — resubmit", dot: "bg-danger" },
  UNDER_REVIEW: { label: "Under review", dot: "bg-foreground-muted" },
  ACCEPTED: { label: "Accepted", dot: "bg-success" },
  REJECTED: { label: "Rejected", dot: "bg-danger" },
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
          <Button asChild>
            <Link href="/problems">
              Browse open bounties
            </Link>
          </Button>
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
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    <p className="text-xs font-mono text-foreground-muted">{status.label}</p>
                  </div>
                </div>
                <span className="text-sm font-mono font-medium text-foreground">
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