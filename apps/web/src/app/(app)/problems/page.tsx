import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProblemsPage() {
  const problems = await prisma.problem.findMany({
    where: {
      status: {
        in: ["OPEN", "COMPLETED"],
      },
    },
    include: { _count: { select: { submissions: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="flex flex-col h-full min-h-0 max-w-4xl px-8">
      {/* fixed heading — never scrolls */}
      <div className="pt-10 pb-8 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Bounties</h1>
        <p className="text-sm text-foreground-muted">
          Solve active challenges to earn rewards — completed bounties are shown for reference.
        </p>
      </div>

      {/* only this scrolls */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-10">
        {problems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-sm text-foreground-muted">
              No bounties right now. Check back soon.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {problems.map((p) => (
              <Link
                key={p.id}
                href={`/problems/${p.id}`}
                className="rounded-lg border border-border bg-surface p-5 flex items-center justify-between hover:border-foreground-muted transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-medium text-foreground">{p.title}</h3>
                    {p.status === "COMPLETED" && (
                      <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-success border border-success/30 bg-success/10 px-1.5 py-0.5 rounded">
                        Completed
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] font-mono text-foreground-muted bg-surface-raised px-2 py-0.5 rounded border border-border"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0 pl-4">
                  <span className={`font-mono text-lg font-semibold block ${p.status === "COMPLETED" ? "text-foreground-muted line-through" : "text-emerald-500"}`}>
                    {p.bountyAmount ? `$${p.bountyAmount}` : "Free"}
                  </span>
                  <span className="text-xs text-foreground-muted">
                    {p._count.submissions} submission{p._count.submissions === 1 ? "" : "s"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}