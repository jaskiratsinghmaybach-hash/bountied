import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function ProblemsPage() {
  const problems = await prisma.problem.findMany({
    where: { status: "OPEN" },
    include: { _count: { select: { submissions: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Open bounties</h1>
      <p className="text-sm text-foreground-muted mb-8">
        Pick something and submit a solution — funds are already in escrow.
      </p>

      {problems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-foreground-muted">
            No open bounties right now. Check back soon.
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
                <h3 className="font-medium text-foreground mb-1">{p.title}</h3>
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
                <span className="font-mono text-lg font-semibold text-money block">
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
    </main>
  );
}