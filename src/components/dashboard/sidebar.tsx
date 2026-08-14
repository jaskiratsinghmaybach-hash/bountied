import Link from "next/link";
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

/**
 * Role-aware sidebar. For BOTH, this will eventually merge/toggle between
 * the two link sets (product decision made 2026-07-29: build Solver and
 * Giver dashboards first, compose BOTH from their pieces afterward).
 */
export function DashboardSidebar({ role }: { role: Role }) {
  const links = role === "GIVER" ? giverLinks : solverLinks;

  return (
    <aside
      data-dashboard-sidebar
      className="fixed top-16 left-0 bottom-0 z-40 w-56 shrink-0 border-r border-border bg-background px-3 py-6 flex flex-col gap-1"
    >
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground-muted hover:text-foreground hover:bg-surface transition-colors"
          >
            <Icon size={16} />
            {link.label}
          </Link>
        );
      })}

      <div className="mt-auto pt-4 border-t border-border">
        <Link
          href="/integrations"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground-muted hover:text-foreground hover:bg-surface transition-colors"
        >
          <Plug size={16} />
          Integrations
        </Link>
        <Link
          href="/settings"
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground-muted hover:text-foreground hover:bg-surface transition-colors"
        >
          <Settings size={16} />
          Settings
        </Link>
      </div>
    </aside>
  );
}