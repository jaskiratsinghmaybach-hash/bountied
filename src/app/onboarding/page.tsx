import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { RoleSelector } from "@/components/onboarding/role-selector";
import { syncUserFromSupabase } from "@/lib/auth/sync-user";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await syncUserFromSupabase(user);

  const profile = await prisma.user.findUnique({ where: { id: user.id } });

  // Already picked a role — no need to see this screen again.
  if (profile?.role) redirect("/dashboard");

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <RoleSelector name={profile?.name ?? "there"} />
    </main>
  );
}
