import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { FixedHeader } from "./fixed-header";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Wallet as WalletIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = user ? await getCurrentUser() : null;
  const isGiver = profile?.role === "GIVER" || profile?.role === "BOTH";

  return (
    <FixedHeader>
      <Link href="/" className="font-mono font-semibold text-foreground tracking-tight">
        bountied<span className="text-foreground">.</span>
      </Link>

      <nav className="flex items-center gap-3">
        {user && profile ? (
          <>
            {/* Credit balance - givers only */}
            {isGiver && (
              <div className="flex items-center gap-1.5 text-sm text-foreground-muted">
                <WalletIcon className="h-4 w-4" />
                <span>${Number(profile.creditBalance).toFixed(2)}</span>
              </div>
            )}

            {/* Notification bell - placeholder */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-foreground-muted hover:text-foreground"
                >
                  <Bell className="h-5 w-5" />
                  <span className="sr-only">Notifications</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <p className="text-sm text-foreground-muted text-center py-2">
                  No notifications yet.
                </p>
              </PopoverContent>
            </Popover>

            {/* Account menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full p-0">
                  <Avatar className="h-9 w-9">
                    {profile.avatarUrl ? (
                      <AvatarImage src={profile.avatarUrl} alt={profile.name} />
                    ) : null}
                    <AvatarFallback className="text-xs font-medium">
                      {profile.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{profile.name}</span>
                    <span className="text-xs text-foreground-muted">{profile.email}</span>
                    <span className="text-xs text-foreground-muted">
                      {profile.role === "BOTH" ? "Both" : profile.role?.charAt(0).toUpperCase() + profile.role?.slice(1).toLowerCase()}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={profile.role === "SOLVER" ? "/dashboard/solver" : "/dashboard/giver"}>
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form action={signOut}>
                  <DropdownMenuItem asChild>
                    <button type="submit" className="w-full text-left">
                      Sign out
                    </button>
                  </DropdownMenuItem>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="text-sm text-foreground-muted hover:text-foreground transition-colors px-3 py-2"
            >
              Log in
            </Link>
            <Button asChild size="sm">
              <Link href="/signup">Sign up</Link>
            </Button>
          </>
        )}
      </nav>
    </FixedHeader>
  );
}
