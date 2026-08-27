"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Role = "SOLVER" | "GIVER" | "BOTH";

const ROLE_LABELS: Record<Role, string> = {
  GIVER: "Giver",
  SOLVER: "Solver",
  BOTH: "Both",
};

function userInitial(name: string, email: string): string {
  const source = name.trim() || email.trim();
  return source ? source.charAt(0).toUpperCase() : "?";
}

const menuItemClassName =
  "cursor-pointer rounded-sm text-foreground focus:bg-surface focus:text-foreground hover:bg-surface";

type HeaderAccountMenuProps = {
  name: string;
  email: string;
  role: Role | null;
  avatarUrl: string | null;
};

export function HeaderAccountMenu({
  name,
  email,
  role,
  avatarUrl,
}: HeaderAccountMenuProps) {
  const displayName = name.trim() || email;
  const initial = userInitial(name, email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "rounded-full outline-none transition-opacity",
          "hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
        aria-label="Account menu"
      >
        <Avatar className="h-8 w-8 border border-border">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
          <AvatarFallback className="bg-surface text-xs font-medium text-foreground">
            {initial !== "?" ? (
              initial
            ) : (
              <User className="h-3.5 w-3.5 text-foreground-muted" aria-hidden />
            )}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-border bg-surface">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
            <span className="truncate text-xs text-foreground-muted">{email}</span>
            {role ? (
              <span className="text-xs text-foreground-muted">{ROLE_LABELS[role]}</span>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />
        <DropdownMenuItem asChild className={menuItemClassName}>
          <Link href="/dashboard">Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={menuItemClassName}>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-border" />
        <form action={signOut}>
          <DropdownMenuItem asChild className={menuItemClassName}>
            <button type="submit" className="w-full text-left">
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
