import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";

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
    <main className="px-8 py-10 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Post a problem</h1>
      <p className="text-sm text-foreground-muted mb-8">
        The full creation flow — challenge type, bounty amount, escrow funding — is coming soon.
      </p>

      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <Sparkles size={20} className="mx-auto mb-3 text-foreground-muted" />
        <p className="text-sm text-foreground-muted mb-4">
          This page is a placeholder so the button doesn&apos;t break navigation.
          The real form goes here next.
        </p>
        <Link
          href="/dashboard/giver"
          className="inline-block rounded-md border border-border text-foreground text-sm font-medium px-5 py-2.5 hover:bg-surface transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}