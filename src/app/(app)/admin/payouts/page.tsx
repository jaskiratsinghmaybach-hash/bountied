import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { PayoutRowActions } from "@/components/admin/payout-row-actions";

export default async function AdminPayoutsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/dashboard/solver");

  const [pending, resolved] = await Promise.all([
    prisma.payoutRequest.findMany({
      where: { status: "PENDING" },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { eligibleAt: "asc" },
    }),
    prisma.payoutRequest.findMany({
      where: { status: { in: ["SUCCEEDED", "FAILED"] } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { completedAt: "desc" },
      take: 25,
    }),
  ]);

  return (
    <main className="px-8 py-10 max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Payout queue</h1>
      <p className="text-sm text-foreground-muted mb-8">
        Manual v1 — transfer via Wise using the details below, then mark each
        row once sent.
      </p>

      <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide mb-3">
        Pending ({pending.length})
      </h2>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center mb-10">
          <p className="text-sm text-foreground-muted">No pending payouts.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-10">
          {pending.map((p) => {
            const eligible = p.eligibleAt <= new Date();
            return (
              <div
                key={p.id}
                className="rounded-lg border border-border bg-surface p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {p.legalName}{" "}
                      <span className="text-foreground-muted font-normal">
                        ({p.user.email})
                      </span>
                    </p>
                    <p className="text-xs text-foreground-muted mt-0.5">
                      Requested {p.createdAt.toLocaleDateString()} · Eligible{" "}
                      {p.eligibleAt.toLocaleDateString()}{" "}
                      {!eligible && (
                        <span className="text-emerald-500">(not yet due)</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-lg font-semibold text-emerald-500">
                      ${Number(p.payoutAmount).toFixed(2)}
                    </p>
                    <p className="text-[11px] text-foreground-muted">
                      of ${Number(p.requestedAmount).toFixed(2)} requested
                    </p>
                  </div>
                </div>

                <div className="rounded-md bg-surface-raised px-3 py-2 flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono">
                  <span className="text-foreground-muted">
                    Country: <span className="text-foreground">{p.bankCountry}</span>
                  </span>
                  <span className="text-foreground-muted">
                    Account: <span className="text-foreground">{p.bankAccountNumber}</span>
                  </span>
                  <span className="text-foreground-muted">
                    IFSC/SWIFT: <span className="text-foreground">{p.bankIfscOrSwift}</span>
                  </span>
                </div>

                <div className="flex justify-end">
                  <PayoutRowActions payoutRequestId={p.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide mb-3">
        Recent history
      </h2>

      {resolved.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nothing resolved yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {resolved.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-border bg-surface px-4 py-3 flex items-center justify-between"
            >
              <p className="text-sm text-foreground">
                {p.legalName}{" "}
                <span className="text-foreground-muted">({p.user.email})</span>
              </p>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-foreground-muted">
                  ${Number(p.payoutAmount).toFixed(2)}
                </span>
                <span
                  className={`text-xs font-medium ${
                    p.status === "SUCCEEDED" ? "text-emerald-500" : "text-danger"
                  }`}
                >
                  {p.status === "SUCCEEDED" ? "Sent" : "Failed"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
