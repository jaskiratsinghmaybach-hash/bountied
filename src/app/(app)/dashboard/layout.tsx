import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await prisma.user.findUnique({ where: { id: user.id } });

  if (!profile?.role) redirect("/onboarding");

  return (
    <div className="flex-1 flex">
      <DashboardSidebar role={profile.role} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
