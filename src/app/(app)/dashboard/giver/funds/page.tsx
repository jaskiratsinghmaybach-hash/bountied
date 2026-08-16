import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { AddCreditsWidget } from "@/components/payments/add-credits-widget";

export default async function GiverFundsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, creditBalance: true },
  });
  if (!profile) redirect("/login");
  if (profile.role === "SOLVER") redirect("/dashboard/solver");
  if (!profile.role) redirect("/onboarding");

  return (
    <main className="px-8 py-10 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Funds</h1>
        <p className="text-sm text-foreground-muted">
          Add credits to your wallet to fund bounties and sandbox reviews.
        </p>
      </div>

      <AddCreditsWidget currentBalance={Number(profile.creditBalance)} />
    </main>
  );
}
