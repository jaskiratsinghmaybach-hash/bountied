import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });
  if (!profile) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Settings</h1>

      <div className="rounded-lg border border-border bg-surface p-6 flex flex-col gap-4">
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
    </main>
  );
}