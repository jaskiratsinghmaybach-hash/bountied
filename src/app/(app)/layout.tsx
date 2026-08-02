import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /problems and /problems/[id] are public browsing pages. A logged-out
  // visitor, or someone who hasn't finished onboarding, sees plain content
  // with no sidebar — the sidebar only makes sense once we know a role.
  let role: "SOLVER" | "GIVER" | "BOTH" | null = null;
  if (user) {
    const profile = await prisma.user.findUnique({ where: { id: user.id } });
    role = profile?.role ?? null;
  }

  if (!role) {
    return <div className="flex-1 min-h-0 flex overflow-y-auto">{children}</div>;
  }

  return (
    <div className="flex-1 min-h-0 flex">
      <DashboardSidebar role={role} />
      <div className="flex-1 min-w-0 overflow-y-auto">{children}</div>
    </div>
  );
}