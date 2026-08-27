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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useState } from "react";

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
];

export function DashboardSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const links = role === "GIVER" ? giverLinks : solverLinks;

  const isActive = (href: string) => {
    if (href === "/dashboard/solver" || href === "/dashboard/giver") {
      return pathname === href;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside
      className={[
        "shrink-0 h-full border-r border-border",
        "flex flex-col",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-16" : "w-56",
      ].join(" ")}
    >
      {/* Collapse control */}
      <div
        className={[
          "h-16 flex items-center border-b border-border",
          collapsed ? "justify-center" : "justify-end px-3",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex h-9 w-9 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} strokeWidth={1.7} />
          ) : (
            <PanelLeftClose size={18} strokeWidth={1.7} />
          )}
        </button>
      </div>

      {/* Main navigation */}
      <nav className="flex flex-col gap-1 px-2 py-4">
        {links.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              aria-label={collapsed ? link.label : undefined}
              className={[
                "flex h-10 items-center rounded-md text-sm",
                "transition-colors",
                collapsed
                  ? "justify-center px-0"
                  : "gap-2.5 px-3",
                active
                  ? "bg-surface text-foreground"
                  : "text-foreground-muted hover:bg-surface hover:text-foreground",
              ].join(" ")}
            >
              <Icon
                size={17}
                strokeWidth={1.7}
                className="shrink-0"
              />

              {!collapsed && (
                <span className="whitespace-nowrap overflow-hidden">
                  {link.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom navigation */}
      <div className="mt-auto border-t border-border px-2 py-4">
        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          aria-label={collapsed ? "Settings" : undefined}
          className={[
            "flex h-10 items-center rounded-md text-sm",
            "transition-colors",
            collapsed
              ? "justify-center px-0"
              : "gap-2.5 px-3",
            pathname === "/settings"
              ? "bg-surface text-foreground"
              : "text-foreground-muted hover:bg-surface hover:text-foreground",
          ].join(" ")}
        >
          <Settings
            size={17}
            strokeWidth={1.7}
            className="shrink-0"
          />

          {!collapsed && (
            <span className="whitespace-nowrap overflow-hidden">
              Settings
            </span>
          )}
        </Link>
      </div>
    </aside>
  );
}