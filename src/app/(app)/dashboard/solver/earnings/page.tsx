import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { Wallet, Trophy } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";

export default async function SolverEarningsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");
  if (profile.role === "GIVER") redirect("/dashboard/giver");
  if (!profile.role) redirect("/onboarding");

  const accepted = await prisma.submission.findMany({
    where: { solverId: user.id, status: "ACCEPTED" },
    include: { problem: true },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <main className="px-8 py-10 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Earnings</h1>

      <div className="grid grid-cols-2 gap-3 mb-10">
        <StatCard
          label="Total earned"
          value={`$${Number(profile.totalEarned).toFixed(2)}`}
          icon={Wallet}
          accent
        />
        <StatCard label="Bounties won" value={String(profile.completionCount)} icon={Trophy} />
      </div>

      <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide mb-4">
        Paid out
      </h2>

      {accepted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-foreground-muted">Nothing paid out yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {accepted.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between"
            >
              <p className="text-sm font-medium text-foreground">{s.problem.title}</p>
              <span className="text-xs font-mono text-money">
                {s.problem.bountyAmount ? `$${s.problem.bountyAmount}` : "Free"}
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}