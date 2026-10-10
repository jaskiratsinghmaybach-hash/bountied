import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { SettingsPayoutSection } from "@/components/payments/settings-payout-section";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");

  const showSolverSection = profile.role === "SOLVER" || profile.role === "BOTH";

  return (
    <main className="px-8 py-10 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Settings</h1>

      <div className="rounded-lg border border-border bg-surface p-6 flex flex-col gap-4 mb-6">
        <div>
          <p className="text-xs text-foreground-muted uppercase tracking-wide mb-1">Name</p>
          <p className="text-sm text-foreground">{profile.name}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted uppercase tracking-wide mb-1">Email</p>
          <p className="text-sm text-foreground">{profile.email}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted uppercase tracking-wide mb-1">Role</p>
          <p className="text-sm text-foreground">{profile.role ?? "Not set"}</p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {showSolverSection && (
          <SettingsPayoutSection
            bankDetailsAdded={profile.bankDetailsAdded}
            availableBalance={Number(profile.availableBalance)}
          />
        )}
      </div>
    </main>
  );
}
