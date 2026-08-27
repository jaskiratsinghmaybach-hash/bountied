"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function HeaderNotifications() {
  // Replace this with your real unread-notification count later.
  const unreadCount = 0;

  const hasUnread = unreadCount > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
          aria-label={
            hasUnread
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Bell
            className="h-[17px] w-[17px]"
            strokeWidth={1.7}
            aria-hidden="true"
          />

          {hasUnread ? (
            <span
              aria-hidden="true"
              className="absolute right-[5px] top-[5px] h-1.5 w-1.5 rounded-full bg-foreground"
            />
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 border-border bg-surface p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium text-foreground">
            Notifications
          </h3>

          {hasUnread ? (
            <button
              type="button"
              className="text-xs text-foreground-muted transition-colors hover:text-foreground"
            >
              Mark all as read
            </button>
          ) : null}
        </div>

        <div className="flex min-h-24 items-center justify-center px-4 py-6">
          <p className="text-center text-sm text-foreground-muted">
            No notifications yet
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}