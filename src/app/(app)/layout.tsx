import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { OAuthFragmentHandler } from "@/components/auth/oauth-fragment-handler";

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
    return (
      <div
        id="main-scroll"
        className="flex-1 min-h-0 flex flex-col overflow-y-auto h-[calc(100vh-4rem)]"
      >
        <OAuthFragmentHandler />
        {children}
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0">
      <DashboardSidebar role={role} />
      <div
        id="main-scroll"
        className="ml-56 h-[calc(100vh-4rem)] min-w-0 overflow-y-auto flex flex-col"
      >
        <OAuthFragmentHandler />
        {children}
      </div>
    </div>
  );
}
