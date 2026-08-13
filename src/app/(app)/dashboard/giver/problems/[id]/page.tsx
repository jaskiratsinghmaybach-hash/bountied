import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { FREE_REVIEWS_PER_PROBLEM } from "@/lib/reviews/pricing";
import { creditsRequiredToFund } from "@/lib/payments/fees";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DraftActions } from "@/components/problems/draft-actions";
import { FundDraftButton } from "@/components/problems/fund-draft-button";
import { GiverSubmissionCard } from "@/components/problems/giver-submission-card";
import type { ProblemStatus, ProblemType } from "@prisma/client";

const statusLabel: Record<ProblemStatus, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "text-foreground-muted" },
  FUNDED: { label: "Funded", color: "text-money" },
  OPEN: { label: "Open", color: "text-accent" },
  IN_REVIEW: { label: "In review", color: "text-money" },
  COMPLETED: { label: "Completed", color: "text-foreground-muted" },
  CANCELLED: { label: "Cancelled", color: "text-danger" },
  REFUNDED: { label: "Refunded", color: "text-foreground-muted" },
};

const typeLabel: Record<ProblemType, string> = {
  OPEN_FREE: "Free / practice",
  OPEN_BOUNTY: "Open bounty",
  FIRST_TO_SOLVE: "First to solve",
  INVITE_ONLY: "Invite only",
  FIXED_PRICE: "Fixed price",
};

export default async function GiverProblemPage({
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

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, githubUsername: true },
  });
  if (!profile) redirect("/login");
  if (profile.role === "SOLVER") redirect("/dashboard/solver");
  if (!profile.role) redirect("/onboarding");

  const problem = await prisma.problem.findUnique({
    where: { id },
    include: {
      escrow: true,
      submissions: {
        include: { solver: { select: { name: true } } },
        orderBy: { submittedAt: "desc" },
      },
    },
  });

  if (!problem) notFound();
  if (problem.giverId !== user.id) notFound();

  const freeReviewsLeft = Math.max(0, FREE_REVIEWS_PER_PROBLEM - problem.freeReviewsUsed);
  const status = statusLabel[problem.status];
  const isDraft = problem.status === "DRAFT";
  const isCompleted = problem.status === "COMPLETED";
  const bountyAmount = problem.bountyAmount ? Number(problem.bountyAmount) : null;

  return (
    <main className="px-8 py-10 max-w-4xl">
      <Link
        href="/dashboard/giver/problems"
        className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Back to My bounties
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {problem.title}
            </h1>
            <span className={`text-xs font-mono ${status.color}`}>{status.label}</span>
          </div>
          <p className="text-sm text-foreground-muted">
            {typeLabel[problem.type]}
            {!isDraft && (
              <>
                {" "}
                · {problem.submissions.length} submission
                {problem.submissions.length === 1 ? "" : "s"}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="font-mono text-xl font-semibold text-money">
            {bountyAmount ? `$${bountyAmount.toFixed(2)}` : "Free"}
          </span>
          {isDraft && <DraftActions problemId={problem.id} />}
        </div>
      </div>

      {isDraft && bountyAmount && (
        <FundDraftButton
          problemId={problem.id}
          requiredTotal={creditsRequiredToFund(bountyAmount)}
        />
      )}

      {isDraft && (
        <div className="rounded-lg border border-dashed border-border bg-surface/50 p-4 mb-6">
          <p className="text-sm text-foreground-muted">
            This bounty is still a draft.{" "}
            <Link
              href={`/dashboard/giver/problems/${problem.id}/edit`}
              className="text-accent hover:underline"
            >
              Edit it
            </Link>{" "}
            or fund it to make it visible to solvers.
          </p>
        </div>
      )}

      <section className="rounded-lg border border-border bg-surface p-6 mb-8">
        <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide mb-4">
          Problem details
        </h2>

        {problem.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {problem.tags.map((tag) => (
              <span
                key={tag}
                className="text-[11px] font-mono text-foreground-muted bg-surface-raised px-2 py-0.5 rounded border border-border"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mb-5">
          <p className="text-xs text-foreground-muted uppercase tracking-wide mb-2">
            Sandbox run command
          </p>
          <code className="block rounded-md border border-accent/25 bg-accent/5 px-3 py-2.5 text-sm font-mono text-foreground">
            {problem.runCommand}
          </code>
          <p className="text-[11px] text-foreground-muted mt-1.5">
            The sandbox runs this exact command against every submitted repo.
          </p>
        </div>

        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap mb-4">
          {problem.description}
        </p>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs font-mono text-foreground-muted pt-4 border-t border-border">
          <span>Posted {problem.createdAt.toLocaleDateString()}</span>
          {problem.deadline && (
            <span>Deadline {problem.deadline.toLocaleDateString()}</span>
          )}
          {!isDraft && (
            <span>
              Sandbox reviews left: {freeReviewsLeft} / {FREE_REVIEWS_PER_PROBLEM}
            </span>
          )}
        </div>
      </section>

      {!isDraft && (
        <section>
          <h2 className="text-sm font-medium text-foreground-muted uppercase tracking-wide mb-4">
            Submissions
          </h2>

          {problem.submissions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <p className="text-sm text-foreground-muted">
                No submissions yet. Solvers can find this bounty on the browse page once
                it&apos;s open.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {problem.submissions.map((submission) => (
                <GiverSubmissionCard
                  key={submission.id}
                  submission={submission}
                  problemId={problem.id}
                  giverId={problem.giverId}
                  freeReviewsLeft={freeReviewsLeft}
                  giverGithubUsername={profile.githubUsername}
                  problemCompleted={isCompleted}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
