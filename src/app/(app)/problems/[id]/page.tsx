import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { SubmissionForm } from "@/components/problems/submission-form";
import { ManifestHelper } from "@/components/problems/manifest-helper";
import { parseDescription, DESCRIPTION_SECTION_HEADERS } from "@/lib/problems/description-sections";
import { getLanguageDef } from "@/components/problems/bounty-flow/flow-data";
import { renderManifestSkeleton, buildManifestPrompt } from "@/lib/problems/manifest-template";
import { classifySubmissionFailure } from "@/lib/problems/submission-failure";

/** Product decision 2026-09-29 — see submission-actions.ts's createSubmission for the enforcement side. */
const MAX_SUBMISSION_ATTEMPTS = 3;

export default async function ProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [problem, profile] = await Promise.all([
    prisma.problem.findUnique({
      where: { id },
      include: { giver: true, _count: { select: { submissions: true } } },
    }),
    user ? prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, githubConnected: true },
    }) : null,
  ]);

  if (!problem) notFound();

  // Solvers see EVERY attempt they've made on this problem (up to
  // MAX_SUBMISSION_ATTEMPTS), not just one — product decision 2026-09-29.
  // Each attempt is its own row with its own independently mirrored repo
  // (see createSubmission's doc comment in submission-actions.ts), so a
  // rejected attempt 1 still has real history worth showing even after
  // attempt 2 exists.
  const mySubmissions = user
    ? await prisma.submission.findMany({
        where: { problemId: id, solverId: user.id },
        select: {
          id: true,
          status: true,
          sandboxOutput: true,
          sandboxError: true,
          notificationLinks: {
            select: {
              notification: {
                select: { id: true, body: true, createdAt: true, sender: { select: { name: true } } },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          sandboxExitCode: true,
          writeup: true,
          attemptNumber: true,
        },
        orderBy: { attemptNumber: "asc" },
      })
    : [];
  const canResubmit = mySubmissions.length < MAX_SUBMISSION_ATTEMPTS;

  const isSolver = profile?.role === "SOLVER" || profile?.role === "BOTH";
  const isGiver = profile?.role === "GIVER" || profile?.role === "BOTH";
  const isOwner = problem.giverId === user?.id;

  return (
    <main className="px-8 py-10 max-w-3xl">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">{problem.title}</h1>
          {problem.status === "COMPLETED" && (
            <span className="inline-flex items-center rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-mono font-medium text-success border border-success/30">
              Completed
            </span>
          )}
        </div>
        <span className={`font-mono text-xl font-semibold shrink-0 pl-4 ${problem.status === "COMPLETED" ? "text-foreground-muted line-through" : "text-emerald-500"}`}>
          {problem.bountyAmount ? `$${problem.bountyAmount}` : "Free"}
        </span>
      </div>

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

      <div className="mb-6">
        <p className="text-xs text-foreground-muted uppercase tracking-wide mb-2">
          Sandbox run command
        </p>
        <code className="block rounded-md border border-accent/25 bg-primary/5 px-3 py-2.5 text-sm font-mono text-foreground">
          {problem.runCommand}
        </code>
        <p className="text-[11px] text-foreground-muted mt-1.5">
          Your repo must pass when the sandbox runs this command.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6 mb-6">
        <DescriptionSections description={problem.description} />
      </div>

      <div className="flex items-center justify-between text-sm text-foreground-muted mb-8">
        <span>Posted by {problem.giver.name}</span>
        <span>
          {problem._count.submissions} submission
          {problem._count.submissions === 1 ? "" : "s"}
        </span>
      </div>

      {/* Giver sees nothing to submit here */}
      {isOwner && (
        <div className="rounded-lg border border-dashed border-border p-5 text-center mb-6">
          <p className="text-sm text-foreground-muted">
            You posted this bounty. View submissions from your{" "}
            <a href={`/dashboard/giver/problems/${problem.id}`} className="text-primary hover:underline">
              dashboard
            </a>.
          </p>
        </div>
      )}

      {/* Problem is completed — show banner instead of submission form for solvers/guests */}
      {!isOwner && problem.status === "COMPLETED" && (
        <div className="rounded-lg border border-success/20 bg-success/5 p-6 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2.5 w-2.5 rounded-full bg-success animate-pulse" />
            <p className="text-sm font-medium text-success">Bounty Completed</p>
          </div>
          <p className="text-xs text-foreground-muted">
            This bounty has been successfully solved, the solution was accepted, and the funds have been released. It is no longer accepting new submissions.
          </p>
        </div>
      )}

      {/* Not logged in */}
      {!user && problem.status === "OPEN" && (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-sm text-foreground-muted mb-3">
            Sign in to submit a solution.
          </p>
          <a
            href="/login"
            className="inline-block rounded-md bg-primary text-background font-medium px-5 py-2.5 text-sm hover:bg-primary/80 transition-colors"
          >
            Sign in
          </a>
        </div>
      )}

      {/* Logged in but not a solver and not the owner */}
      {user && !isSolver && !isOwner && problem.status === "OPEN" && (
        <div className="rounded-lg border border-border bg-surface p-5 text-center">
          <p className="text-sm text-foreground-muted">
            Your account is set up as a problem giver. Switch to a solver account to submit.
          </p>
        </div>
      )}

      {/* Solver's own attempts — every one made so far, oldest first */}
      {isSolver && !isOwner && mySubmissions.length > 0 && (
        <div className="flex flex-col gap-4">
          {mySubmissions.map((s) => {
            const failure = classifySubmissionFailure(s);
            return (
              <div key={s.id} className="rounded-lg border border-border bg-surface p-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-foreground">
                    Attempt {s.attemptNumber} of {MAX_SUBMISSION_ATTEMPTS}
                  </p>
                  <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                    s.status === "UNDER_REVIEW" || s.status === "ACCEPTED"
                      ? "text-emerald-500 border-money/30 bg-emerald-500/10"
                      : s.status === "RUNNING"
                        ? "text-primary border-accent/30 bg-primary/10"
                        : s.status === "MIRRORING"
                          ? "text-foreground-muted border-border"
                          : failure
                            ? "text-danger border-danger/30 bg-danger/10"
                            : "text-foreground-muted border-border"
                  }`}>
                    {s.status.replace("_", " ").toLowerCase()}
                  </span>
                </div>

                {s.status === "MIRRORING" && (
                  <p className="text-xs text-foreground-muted">
                    Your repo is being prepared for review. This takes a few seconds — no
                    sandbox has run yet, and no free review has been used.
                  </p>
                )}

                {s.status === "RUNNING" && (
                  <p className="text-xs text-foreground-muted">
                    The giver started a sandbox run on your repo. Refresh in 30 seconds to see the output.
                  </p>
                )}

                {failure && (
                  <p className="text-xs text-danger mb-2">{failure.summary}</p>
                )}

                {s.sandboxOutput && (
                  <div>
                    <p className="text-[11px] text-foreground-muted uppercase tracking-wide mb-1.5">
                      Captured output
                    </p>
                    <pre className="text-xs font-mono text-foreground bg-surface-raised rounded-md p-4 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto border border-border">
                      {s.sandboxOutput}
                    </pre>
                  </div>
                )}

                {/* Messages from the giver referencing this attempt
                    (product decision 2026-09-30) — the same notifications
                    a solver sees in the header bell, surfaced here too so
                    they don't have to rely on remembering/finding the
                    bell item to keep track of what the giver said about
                    THIS specific attempt. */}
                {s.notificationLinks.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border/50 flex flex-col gap-2">
                    <p className="text-[11px] text-foreground-muted uppercase tracking-wide">
                      Messages from the giver
                    </p>
                    {s.notificationLinks.map(({ notification: n }) => (
                      <div key={n.id} className="rounded-md bg-surface-raised p-3">
                        <p className="text-xs text-foreground-muted mb-1">
                          {n.sender?.name ?? "Bountied"} ·{" "}
                          <span className="font-mono">{new Date(n.createdAt).toLocaleString()}</span>
                        </p>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {n.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Solver can still submit — up to MAX_SUBMISSION_ATTEMPTS total */}
      {isSolver && !isOwner && canResubmit && problem.status === "OPEN" && (
        <div className="flex flex-col gap-4">
          <ManifestHelper
            languageLabel={getLanguageDef(problem.language ?? "python")?.label ?? "Python"}
            skeleton={renderManifestSkeleton(problem.language ?? "python")}
            prompt={buildManifestPrompt({
              languageId: problem.language ?? "python",
              scopeId: problem.scope,
              runCommand: problem.runCommand,
            })}
          />
          <SubmissionForm
            problemId={problem.id}
            githubConnected={profile?.githubConnected ?? false}
          />
        </div>
      )}
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

  // Legacy row with no headers — render as plain text
  if (entries.length === 1 && entries[0].header === DESCRIPTION_SECTION_HEADERS.problem) {
    const hasHeaders = description.includes("##");
    if (!hasHeaders) {
      return (
        <p className="text-sm text-foreground-muted leading-relaxed whitespace-pre-wrap">
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
