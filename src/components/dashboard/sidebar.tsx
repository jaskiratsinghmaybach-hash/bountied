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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useState } from "react";

type Role = "SOLVER" | "GIVER" | "BOTH";

const solverLinks = [
  { href: "/dashboard/solver", label: "Overview", icon: LayoutDashboard },
  { href: "/problems", label: "Browse bounties", icon: Search },
  {
    href: "/dashboard/solver/submissions",
    label: "My submissions",
    icon: FileText,
  },
  { href: "/dashboard/solver/earnings", label: "Earnings", icon: Wallet },
];

const giverLinks = [
  { href: "/dashboard/giver", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/giver/problems", label: "My bounties", icon: Inbox },
  { href: "/problems/new", label: "Post a bounty", icon: PlusCircle },
];

export function DashboardSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const links = role === "GIVER" ? giverLinks : solverLinks;

  return (
    <aside
      className={[
        "relative h-[calc(100vh-4.5rem)] shrink-0 border-r border-border",
        "flex flex-col",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-56",
      ].join(" ")}
    >
      {/* Main navigation */}
      <nav className="flex flex-col gap-1 px-2 py-4">
        {links.map((link, index) => {
          const Icon = link.icon;
          const active =
            pathname === link.href ||
            (link.href !== "/dashboard/solver" &&
              link.href !== "/dashboard/giver" &&
              pathname.startsWith(`${link.href}/`));

          return (
            <div key={link.href} className="relative flex items-center">
              <Link
                href={link.href}
                title={collapsed ? link.label : undefined}
                aria-label={collapsed ? link.label : undefined}
                className={[
                  "flex h-10 w-full items-center rounded-md text-sm",
                  "transition-colors",
                  collapsed ? "justify-center px-0" : "gap-2.5 px-3",
                  active
                    ? "bg-surface text-foreground"
                    : "text-foreground-muted hover:bg-surface hover:text-foreground",
                ].join(" ")}
              >
                <Icon size={17} strokeWidth={1.7} className="shrink-0" />

                {!collapsed && (
                  <span className="whitespace-nowrap overflow-hidden">
                    {link.label}
                  </span>
                )}
              </Link>

              {/* Collapse button sits on the sidebar crease */}
              {index === 0 && (
                <button
                  type="button"
                  onClick={() => setCollapsed((value) => !value)}
                  className={[
                    "absolute right-0 top-5 z-50 flex h-7.75 w-7.75 translate-x-1/2 items-center justify-center",
                    "border border-border bg-background text-foreground-muted",
                    "transition-colors hover:bg-surface hover:text-foreground",
                  ].join(" ")}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {collapsed ? (
                    <PanelLeftOpen size={20} strokeWidth={1.7} />
                  ) : (
                    <PanelLeftClose size={25} strokeWidth={1.7} />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom navigation */}
      <div className="mt-auto border-t border-border px-2 py-4">
        <Link
          href="/integrations"
          title={collapsed ? "Integrations" : undefined}
          aria-label={collapsed ? "Integrations" : undefined}
          className={[
            "flex h-10 items-center rounded-md text-sm",
            "transition-colors",
            collapsed ? "justify-center px-0" : "gap-2.5 px-3",
            pathname === "/integrations"
              ? "bg-surface text-foreground"
              : "text-foreground-muted hover:bg-surface hover:text-foreground",
          ].join(" ")}
        >
          <Plug size={17} strokeWidth={1.7} className="shrink-0" />

          {!collapsed && (
            <span className="whitespace-nowrap overflow-hidden">
              Integrations
            </span>
          )}
        </Link>

        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          aria-label={collapsed ? "Settings" : undefined}
          className={[
            "flex h-10 items-center rounded-md text-sm",
            "transition-colors",
            collapsed ? "justify-center px-0" : "gap-2.5 px-3",
            pathname === "/settings"
              ? "bg-surface text-foreground"
              : "text-foreground-muted hover:bg-surface hover:text-foreground",
          ].join(" ")}
        >
          <Settings size={17} strokeWidth={1.7} className="shrink-0" />

          {!collapsed && (
            <span className="whitespace-nowrap overflow-hidden">Settings</span>
          )}
        </Link>
      </div>
    </aside>
  );
}
