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
  Banknote,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import { cn } from "@/lib/utils";

type Role = "SOLVER" | "GIVER" | "BOTH";

const solverLinks = [
  {
    href: "/dashboard/solver",
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    href: "/problems",
    label: "Browse bounties",
    icon: Search,
  },
  {
    href: "/dashboard/solver/submissions",
    label: "My submissions",
    icon: FileText,
  },
  {
    href: "/dashboard/solver/earnings",
    label: "Earnings",
    icon: Wallet,
  },
];

const giverLinks = [
  {
    href: "/dashboard/giver",
    label: "Overview",
    icon: LayoutDashboard,
  },
  {
    href: "/dashboard/giver/problems",
    label: "My bounties",
    icon: Inbox,
  },
  {
    href: "/problems/new",
    label: "Post a bounty",
    icon: PlusCircle,
  },
  {
    href: "/dashboard/giver/wallet",
    label: "Wallet",
    icon: Wallet,
  },
  {
    href: "/dashboard/giver/funds",
    label: "Funds",
    icon: Banknote,
  },
];

const bottomLinks = [
  {
    href: "/integrations",
    label: "Integrations",
    icon: Plug,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
  },
];

function SidebarInner({ role }: { role: Role }) {
  const links = role === "GIVER" ? giverLinks : solverLinks;
  const pathname = usePathname();

  return (
    <Sidebar
      data-dashboard-sidebar
      className="top-16 h-[calc(100vh-4rem)] border-r border-border bg-background"
      collapsible="icon"
    >
      <SidebarHeader className="h-16 border-b border-border p-0 flex items-center justify-center">
        <SidebarTrigger
          className="h-8 w-8 text-foreground-muted hover:text-foreground hover:bg-surface"
          aria-label="Toggle sidebar"
        />
      </SidebarHeader>
      {/* Collapse control */}
      <SidebarHeader className="border-b border-border/60 px-3 py-3">
        <SidebarTrigger
          className="ml-auto text-foreground-muted hover:bg-surface hover:text-foreground group-data-[collapsible=icon]:mx-auto"
          aria-label="Toggle sidebar"
        />
      </SidebarHeader>

      {/* Main navigation */}
      <SidebarContent className="px-3 py-6">
        <SidebarMenu>
          {links.map((link) => {
            const Icon = link.icon;

            const isDashboardHome =
              link.href === "/dashboard/giver" ||
              link.href === "/dashboard/solver";

            const isActive = isDashboardHome
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(link.href + "/");

            return (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={link.label}
                  className={cn(
                    "w-full gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    "group-data-[collapsible=icon]:justify-center",
                    "group-data-[collapsible=icon]:gap-0",
                    isActive
                      ? "bg-foreground text-background font-medium"
                      : "text-foreground-muted hover:bg-surface hover:text-foreground",
                  )}
                >
                  <Link href={link.href}>
                    <Icon size={16} />
                    <span className="group-data-[collapsible=icon]:hidden">
                      {link.label}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Secondary navigation */}
      <SidebarFooter className="border-t border-border px-3 pb-6 pt-4">
        <SidebarMenu>
          {bottomLinks.map((link) => {
            const Icon = link.icon;

            const isActive =
              pathname === link.href || pathname.startsWith(link.href + "/");

            return (
              <SidebarMenuItem key={link.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={link.label}
                  className={cn(
                    "w-full gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    "group-data-[collapsible=icon]:justify-center",
                    "group-data-[collapsible=icon]:gap-0",
                    isActive
                      ? "bg-foreground text-background font-medium"
                      : "text-foreground-muted hover:bg-surface hover:text-foreground",
                  )}
                >
                  <Link href={link.href}>
                    <Icon size={16} />
                    <span className="group-data-[collapsible=icon]:hidden">
                      {link.label}
                    </span>
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
