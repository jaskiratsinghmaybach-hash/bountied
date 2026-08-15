"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  FileText,
  Wallet,
  Settings,
  PlusCircle,
  Inbox,
  Plug,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type Role = "SOLVER" | "GIVER" | "BOTH";

const solverLinks = [
  { href: "/dashboard/solver", label: "Overview", icon: LayoutDashboard },
  { href: "/problems", label: "Browse bounties", icon: Search },
  { href: "/dashboard/solver/submissions", label: "My submissions", icon: FileText },
  { href: "/dashboard/solver/earnings", label: "Earnings", icon: Wallet },
];

const giverLinks = [
  { href: "/dashboard/giver", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/giver/problems", label: "My bounties", icon: Inbox },
  { href: "/problems/new", label: "Post a bounty", icon: PlusCircle },
  { href: "/dashboard/giver/wallet", label: "Wallet", icon: Wallet },
];

const bottomLinks = [
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Role-aware sidebar. For BOTH, this will eventually merge/toggle between
 * the two link sets (product decision made 2026-07-29: build Solver and
 * Giver dashboards first, compose BOTH from their pieces afterward).
 */
function SidebarInner({ role }: { role: Role }) {
  const links = role === "GIVER" ? giverLinks : solverLinks;
  const pathname = usePathname();

  return (
    <Sidebar
      data-dashboard-sidebar
      className="top-16 h-[calc(100vh-4rem)] border-r border-border bg-background"
      collapsible="none"
    >
      <SidebarContent className="px-3 py-6">
        <SidebarMenu>
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className={cn(
                    "gap-2.5 rounded-md px-3 py-2 text-sm transition-colors w-full",
                    isActive
                      ? "bg-foreground text-background font-medium"
                      : "text-foreground-muted hover:text-foreground hover:bg-surface"
                  )}
                >
                  <Link href={link.href}>
                    <Icon size={16} />
                    <span>{link.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-6 pt-4 border-t border-border">
        <SidebarMenu>
          {bottomLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className={cn(
                    "gap-2.5 rounded-md px-3 py-2 text-sm transition-colors w-full",
                    isActive
                      ? "bg-foreground text-background font-medium"
                      : "text-foreground-muted hover:text-foreground hover:bg-surface"
                  )}
                >
                  <Link href={link.href}>
                    <Icon size={16} />
                    <span>{link.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export { SidebarInner as DashboardSidebar };