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
import { StickyHeaderWatcher } from "@/components/problems/sticky-header-watcher";
import type { ProblemStatus, ProblemType } from "@prisma/client";
import { parseDescription, DESCRIPTION_SECTION_HEADERS } from "@/lib/problems/description-sections";

const statusLabel: Record<ProblemStatus, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "text-foreground-muted" },
  FUNDED: { label: "Funded", color: "text-emerald-500" },
  OPEN: { label: "Open", color: "text-primary" },
  IN_REVIEW: { label: "In review", color: "text-emerald-500" },
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
    <main className="px-8 pb-10 max-w-4xl">
      <StickyHeaderWatcher />
      <div className="sticky top-0 bg-background z-20 pt-10 pb-4 -mx-8 px-8 border-b border-border/20 sticky-header">
        <Link
          href="/dashboard/giver/problems"
          className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to My bounties
        </Link>

        <div className="flex items-start justify-between gap-4">
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
            <span className="font-mono text-xl font-semibold text-emerald-500">
              {bountyAmount ? `$${bountyAmount.toFixed(2)}` : "Free"}
            </span>
            {isDraft && <DraftActions problemId={problem.id} />}
          </div>
        </div>
      </div>

      <div className="pt-6">
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
              className="text-primary hover:underline"
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
          <code className="block rounded-md border border-accent/25 bg-primary/5 px-3 py-2.5 text-sm font-mono text-foreground">
            {problem.runCommand}
          </code>
          <p className="text-[11px] text-foreground-muted mt-1.5">
            The sandbox runs this exact command against every submitted repo.
          </p>
        </div>

        <div className="mb-4">
          <DescriptionSections description={problem.description} />
        </div>

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
          <h2
            className="sticky text-sm font-medium text-foreground-muted uppercase tracking-wide py-3 bg-background z-10 -mx-8 px-8 border-b border-border/10 mb-4"
            style={{ top: "var(--header-height, 148px)" }}
          >
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
      </div>
    </main>
  );
}

const SECTION_LABELS: Record<string, string> = {
  [DESCRIPTION_SECTION_HEADERS.problem]: "Problem",
  [DESCRIPTION_SECTION_HEADERS.whatsBroken]: "What's broken",
  [DESCRIPTION_SECTION_HEADERS.desiredOutput]: "Desired output",
};

function DescriptionSections({ description }: { description: string }) {
  const sections = parseDescription(description);
  const entries = [
    { header: DESCRIPTION_SECTION_HEADERS.problem, body: sections.description },
    { header: DESCRIPTION_SECTION_HEADERS.whatsBroken, body: sections.whatsBroken },
    { header: DESCRIPTION_SECTION_HEADERS.desiredOutput, body: sections.desiredOutput },
  ].filter((s) => s.body);

  if (entries.length === 0) return null;

  if (entries.length === 1 && entries[0].header === DESCRIPTION_SECTION_HEADERS.problem) {
    if (!description.includes("##")) {
      return (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {entries[0].body}
        </p>
      );
    }
  }

  return (
    <div className="space-y-5">
      {entries.map(({ header, body }) => (
        <div key={header}>
          <h3 className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-1.5">
            {SECTION_LABELS[header]}
          </h3>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{body}</p>
        </div>
      ))}
    </div>
  );
}
