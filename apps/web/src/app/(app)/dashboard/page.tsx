import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

/**
 * /dashboard is a pure router — it never renders anything itself.
 * It exists so links like Header's "Dashboard" button and post-login
 * redirects have one stable URL to point at, regardless of role.
 *
 * SOLVER -> /dashboard/solver
 * GIVER  -> /dashboard/giver
 * BOTH   -> /dashboard/solver for now (combined view is a follow-up;
 *           see DashboardSidebar comment for the plan)
 */
export default async function DashboardRouterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });

  if (!profile?.role) redirect("/onboarding");

  if (profile.role === "GIVER") redirect("/dashboard/giver");
  redirect("/dashboard/solver");
}
