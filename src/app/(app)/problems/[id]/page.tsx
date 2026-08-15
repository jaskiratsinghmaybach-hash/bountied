import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { SubmissionForm } from "@/components/problems/submission-form";

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

  // Solvers see their own existing non-rejected submission if one exists
  const existingSubmission = user
    ? await prisma.submission.findFirst({
        where: {
          problemId: id,
          solverId: user.id,
          status: { notIn: ["REJECTED"] },
        },
        select: { id: true, status: true, sandboxOutput: true, sandboxError: true, writeup: true },
      })
    : null;

  const isSolver = profile?.role === "SOLVER" || profile?.role === "BOTH";
  const isGiver = profile?.role === "GIVER" || profile?.role === "BOTH";
  const isOwner = problem.giverId === user?.id;

  return (
    <main className="px-8 py-10 max-w-3xl">
      <div className="flex items-start justify-between mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{problem.title}</h1>
        <span className="font-mono text-xl font-semibold text-emerald-500 shrink-0 pl-4">
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
        <p className="text-sm text-foreground-muted leading-relaxed whitespace-pre-wrap">
          {problem.description}
        </p>
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
        <div className="rounded-lg border border-dashed border-border p-5 text-center">
          <p className="text-sm text-foreground-muted">
            You posted this bounty. View submissions from your{" "}
            <a href={`/dashboard/giver/problems/${problem.id}`} className="text-primary hover:underline">
              dashboard
            </a>.
          </p>
        </div>
      )}

      {/* Not logged in */}
      {!user && (
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
      {user && !isSolver && !isOwner && (
        <div className="rounded-lg border border-border bg-surface p-5 text-center">
          <p className="text-sm text-foreground-muted">
            Your account is set up as a problem giver. Switch to a solver account to submit.
          </p>
        </div>
      )}

      {/* Solver with an existing submission */}
      {isSolver && !isOwner && existingSubmission && (
        <div className="rounded-lg border border-border bg-surface p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">Your submission</p>
            <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
              existingSubmission.status === "UNDER_REVIEW"
                ? "text-emerald-500 border-money/30 bg-emerald-500/10"
                : existingSubmission.status === "RUNNING"
                  ? "text-primary border-accent/30 bg-primary/10"
                  : existingSubmission.status === "SANDBOX_FAILED"
                    ? "text-danger border-danger/30 bg-danger/10"
                    : "text-foreground-muted border-border"
            }`}>
              {existingSubmission.status.replace("_", " ").toLowerCase()}
            </span>
          </div>

          {existingSubmission.status === "RUNNING" && (
            <p className="text-xs text-foreground-muted">
              Your repo is being cloned and run in a sandbox. Refresh in 30 seconds to see the output.
            </p>
          )}

          {existingSubmission.status === "SANDBOX_FAILED" && (
            <div>
              <p className="text-xs text-danger mb-1">Sandbox failed to run your code:</p>
              <pre className="text-[11px] font-mono text-foreground-muted bg-surface-raised rounded p-3 overflow-x-auto whitespace-pre-wrap">
                {existingSubmission.sandboxError}
              </pre>
            </div>
          )}

          {existingSubmission.sandboxOutput && (
            <div>
              <p className="text-[11px] text-foreground-muted uppercase tracking-wide mb-1.5">
                Captured output
              </p>
              <pre className="text-xs font-mono text-foreground bg-surface-raised rounded-md p-4 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto border border-border">
                {existingSubmission.sandboxOutput}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Solver without a submission yet */}
      {isSolver && !isOwner && !existingSubmission && problem.status === "OPEN" && (
        <SubmissionForm
          problemId={problem.id}
          runCommand={problem.runCommand}
          runtime={problem.runtime}
          githubConnected={profile?.githubConnected ?? false}
        />
      )}
    </main>
  );
}
