import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { BountyFlow } from "@/components/problems/bounty-flow/bounty-flow";
import { StickyHeaderWatcher } from "@/components/problems/sticky-header-watcher";

export default async function NewProblemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");
  if (profile.role === "SOLVER") redirect("/dashboard/solver");
  if (!profile.role) redirect("/onboarding");

  return (
    <main className="pb-8 w-full">
      <StickyHeaderWatcher />
      <div className="sticky top-0 bg-background z-20 pt-8 pb-4 border-b border-border/20 px-6 sm:px-10 sticky-header">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mb-1">Post a bounty</h1>
            <p className="text-sm text-foreground-muted">
              Funds are held in escrow the moment you post and only released when
              you accept a submission.
            </p>
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors shrink-0"
          >
            <Wallet size={14} className="text-emerald-500" />
            <span className="font-mono text-foreground">
              ${Number(profile.creditBalance).toFixed(2)}
            </span>
          </Link>
        </div>
      </div>

      <BountyFlow />
    </main>
  );
}
