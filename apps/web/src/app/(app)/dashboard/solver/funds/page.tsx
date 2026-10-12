import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { AddCreditsWidget } from "@/components/payments/add-credits-widget";
import { formatTxAmount, TX_TYPE_LABEL } from "@/lib/payments/tx-labels";
import { SOLVER_FREE_TEST_BOUNTY_LIMIT, SOLVER_TEST_COST_USD } from "@/lib/solver-tests/charge";

/**
 * A Solver's deposited credit. It pays for sandbox tests only: tests spend
 * credit first and then earnings, and credit is not withdrawable (earnings
 * are, from the Earnings page). The checkout and the webhook are the same ones
 * Givers use, and they credit whoever started the checkout.
 */
export default async function SolverFundsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, creditBalance: true, availableBalance: true },
  });
  if (!profile) redirect("/login");
  if (profile.role === "GIVER") redirect("/dashboard/giver");
  if (!profile.role) redirect("/onboarding");

  const transactions = await prisma.creditTransaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const earnings = Number(profile.availableBalance);

  return (
    <main className="px-8 py-10 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Funds</h1>
        <p className="text-sm text-foreground-muted">
          Add credit to run sandbox tests. Each test costs ${SOLVER_TEST_COST_USD.toFixed(2)}, and the first test on each of your first{" "}
          {SOLVER_FREE_TEST_BOUNTY_LIMIT} bounties is free.{" "}
          <Link href="/docs/sandbox" className="underline hover:text-foreground">
            How tests work
          </Link>
        </p>
      </div>

      <AddCreditsWidget currentBalance={Number(profile.creditBalance)} audience="solver" />

      <p className="text-xs text-foreground-muted mt-4">
        When your credit runs out, tests use your earnings (${earnings.toFixed(2)} available).{" "}
        <Link href="/dashboard/solver/earnings" className="underline hover:text-foreground">
          Go to Earnings
        </Link>
      </p>

      <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide mt-10 mb-4">Recent activity</h2>
      {transactions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-foreground-muted">No activity yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {transactions.map((tx) => (
            <div key={tx.id} className="rounded-lg border border-border bg-surface p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{TX_TYPE_LABEL[tx.type]}</p>
                <p className="text-xs mt-1 font-mono text-foreground-muted">{new Date(tx.createdAt).toLocaleString()}</p>
              </div>
              <span className="text-sm font-mono font-medium text-foreground">{formatTxAmount(Number(tx.amount))}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
