import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AcceptSubmissionButton } from "@/components/dashboard/accept-submission-button";

const statusLabel: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "text-foreground-muted" },
  FUNDED: { label: "Funded", color: "text-money" },
  OPEN: { label: "Open", color: "text-accent" },
  IN_REVIEW: { label: "In review", color: "text-money" },
  COMPLETED: { label: "Completed", color: "text-foreground-muted" },
  CANCELLED: { label: "Cancelled", color: "text-danger" },
  REFUNDED: { label: "Refunded", color: "text-foreground-muted" },
};

const submissionStatusLabel: Record<string, { label: string; color: string }> = {
  SUBMITTED: { label: "Submitted", color: "text-foreground-muted" },
  UNDER_REVIEW: { label: "Under review", color: "text-money" },
  ACCEPTED: { label: "Accepted", color: "text-accent" },
  REJECTED: { label: "Rejected", color: "text-danger" },
};

export default async function GiverProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");
  if (profile.role === "SOLVER") redirect("/dashboard/solver");
  if (!profile.role) redirect("/onboarding");

  const problem = await prisma.problem.findUnique({
    where: { id },
    include: {
      escrow: true,
      submissions: {
        include: { solver: true },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  if (!problem) notFound();
  // Ownership check — a giver can only manage their own problems.
  if (problem.giverId !== user.id) notFound();

  const status = statusLabel[problem.status] ?? statusLabel.DRAFT;
  const canAccept =
    problem.escrow?.state === "HELD" &&
    (problem.status === "OPEN" || problem.status === "IN_REVIEW");

  return (
    <main className="px-8 py-10 max-w-4xl">
      <Link
        href="/dashboard/giver/problems"
        className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Back to my problems
      </Link>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">{problem.title}</h1>
          <p className={`text-xs font-mono ${status.color}`}>{status.label}</p>
        </div>
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

      <div className="rounded-lg border border-border bg-surface p-6 mb-10">
        <p className="text-sm text-foreground-muted leading-relaxed whitespace-pre-wrap">
          {problem.description}
        </p>
      </div>

      <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide mb-4">
        Submissions ({problem.submissions.length})
      </h2>

      {problem.submissions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-foreground-muted">
            No submissions yet — solvers will show up here once they submit.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {problem.submissions.map((s) => {
            const sStatus = submissionStatusLabel[s.status] ?? submissionStatusLabel.SUBMITTED;
            return (
              <div
                key={s.id}
                className="rounded-lg border border-border bg-surface p-5 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground">{s.solver.name}</p>
                    <span className={`text-xs font-mono ${sStatus.color}`}>{sStatus.label}</span>
                  </div>
                  <p className="text-xs text-foreground-muted mb-2">
                    Submitted {s.submittedAt.toLocaleDateString()}
                  </p>
                  <p className="text-sm text-foreground-muted leading-relaxed">
                    {s.isRevealed ? (
                      
                        href={s.codeBlobUrl}
                        className="text-accent hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        View full solution →
                      </a>
                    ) : (
                      s.previewText
                    )}
                  </p>
                </div>

                {canAccept && s.status !== "ACCEPTED" && s.status !== "REJECTED" && (
                  <AcceptSubmissionButton problemId={problem.id} submissionId={s.id} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}