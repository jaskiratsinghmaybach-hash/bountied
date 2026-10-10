import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { ArrowDownCircle, CreditCard, Wallet } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { StickyHeaderWatcher } from "@/components/problems/sticky-header-watcher";
import type { CreditTransactionType } from "@prisma/client";

const txTypeLabel: Record<CreditTransactionType, string> = {
  PURCHASE: "Credit purchase",
  BOUNTY_FUNDING: "Bounty funding",
  SUBMISSION_REVIEW: "Submission review",
  REFUND: "Refund",
};

function formatAmount(amount: number) {
  const abs = Math.abs(amount).toFixed(2);
  if (amount < 0) return `-$${abs}`;
  if (amount > 0) return `+$${abs}`;
  return `$${abs}`;
}

export default async function GiverWalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");
  if (profile.role === "SOLVER") redirect("/dashboard/solver");
  if (!profile.role) redirect("/onboarding");

  const [transactions, debits, purchases] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.creditTransaction.aggregate({
      where: { userId: user.id, amount: { lt: 0 } },
      _sum: { amount: true },
    }),
    prisma.creditTransaction.aggregate({
      where: { userId: user.id, type: "PURCHASE" },
      _sum: { amount: true },
    }),
  ]);

  const creditBalance = Number(profile.creditBalance);
  const moneySpent = Math.abs(Number(debits._sum.amount ?? 0));
  const creditsAdded = Number(purchases._sum.amount ?? 0);

  return (
    <main className="px-8 pb-10 max-w-4xl">
      {/* ── Sticky header: title + stats ── */}
      <div className="sticky top-0 bg-background z-20 pt-10 pb-4 -mx-8 px-8 border-b border-border/20 sticky-header">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight mb-1">Wallet</h1>
          <p className="text-sm text-foreground-muted">
            View your credit balance and transaction history.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Credit balance"
            value={`$${creditBalance.toFixed(2)}`}
            icon={Wallet}
          />
          <StatCard
            label="Money spent"
            value={`$${moneySpent.toFixed(2)}`}
            icon={ArrowDownCircle}
          />
          <StatCard
            label="Credits added"
            value={`$${creditsAdded.toFixed(2)}`}
            icon={CreditCard}
          />
        </div>
      </div>

      {/* ── Sticky Transaction History heading ── */}
      <StickyHeaderWatcher />
      <div
        className="sticky z-10 bg-background pt-4 pb-3 -mx-8 px-8 border-b border-border/10"
        style={{ top: "var(--header-height, 200px)" }}
      >
        <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide">
          Transaction history
        </h2>
      </div>

      {/* ── Scrollable transactions ── */}
      <div className="pt-4">
        {transactions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-sm text-foreground-muted">No transactions recorded yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {transactions.map((tx) => {
              const amount = Number(tx.amount);

              return (
                <div
                  key={tx.id}
                  className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {txTypeLabel[tx.type]}
                    </p>
                    <p className="text-xs mt-1 font-mono text-foreground-muted">
                      {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-sm font-mono font-medium text-foreground">
                    {formatAmount(amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
