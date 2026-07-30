import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function ProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const problem = await prisma.problem.findUnique({
    where: { id },
    include: { giver: true, _count: { select: { submissions: true } } },
  });

  if (!problem) notFound();

  return (
    <main className="px-8 py-10 max-w-3xl">
      <div className="flex items-start justify-between mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{problem.title}</h1>
        <span className="font-mono text-xl font-semibold text-money shrink-0 pl-4">
          {problem.bountyAmount ? `$${problem.bountyAmount}` : "Free"}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {problem.tags.map((tag) => (
          <span
            key={tag}
            className="text-[11px] font-mono text-foreground-muted bg-surface-raised px-2 py-0.5 rounded border border-border"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-surface p-6 mb-6">
        <p className="text-sm text-foreground-muted leading-relaxed whitespace-pre-wrap">
          {problem.description}
        </p>
      </div>

      <div className="flex items-center justify-between text-sm text-foreground-muted mb-8">
        <span>Posted by {problem.giver.name}</span>
        <span>{problem._count.submissions} submission{problem._count.submissions === 1 ? "" : "s"}</span>
      </div>

      {/* TODO: submission form goes here once the code-upload flow is wired up */}
      <button
        type="button"
        className="rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors"
      >
        Submit a solution
      </button>
    </main>
  );
}