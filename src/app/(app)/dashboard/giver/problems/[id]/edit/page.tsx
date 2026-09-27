import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BountyFlow } from "@/components/problems/bounty-flow/bounty-flow";
import { StickyHeaderWatcher } from "@/components/problems/sticky-header-watcher";

export default async function EditProblemPage({
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

  const problem = await prisma.problem.findUnique({ where: { id } });
  if (!problem) notFound();
  if (problem.giverId !== user.id) notFound();

  // Editing only ever makes sense for an unfunded draft — once money has
  // moved, the bounty is live and this page should not be reachable.
  if (problem.status !== "DRAFT") {
    redirect(`/dashboard/giver/problems/${problem.id}`);
  }

  return (
    <main className="pb-8 w-full">
      <StickyHeaderWatcher />
      <div className="sticky top-0 bg-background z-20 pt-8 pb-4 border-b border-border/20 px-6 sm:px-10 sticky-header">
        <Link
          href={`/dashboard/giver/problems/${problem.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft size={14} />
          Back to bounty
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight mb-1">Edit draft</h1>
        <p className="text-sm text-foreground-muted">
          Nothing here has been charged yet — change anything, including the
          bounty amount, before you post.
        </p>
      </div>

      <BountyFlow
        existingProblem={{
          id: problem.id,
          title: problem.title,
          description: problem.description,
          type: problem.type,
          tags: problem.tags,
          bountyAmount: problem.bountyAmount ? Number(problem.bountyAmount) : null,
          deadline: problem.deadline
            ? problem.deadline.toISOString().split("T")[0]
            : null,
          runCommand: problem.runCommand,
          language: problem.language,
          scope: problem.scope,
          addons: problem.addons,
          referenceRepoUrls: problem.referenceRepoUrls,
          screenshotUrls: problem.screenshotUrls,
          logs: problem.logs,
        }}
      />
    </main>
  );
}
