"use client";

import { useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { markAllNotificationsRead } from "@/lib/notifications/actions";

type NotificationItem = {
  id: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  senderId: string | null;
  sender: { name: string } | null;
};

/**
 * Renders both kinds of notification this account can receive: platform
 * notifications (senderId null — "your payout is ready") and Giver-sent
 * messages about a specific submission (senderId set — see
 * components/problems/notify-solver-dialog.tsx and product decision
 * 2026-09-29). Attributed by sender name when there is one; a generic
 * "Bountied" label when there isn't, so a system event never reads as if
 * some anonymous person sent it.
 */
export function HeaderNotifications({
  notifications,
}: {
  notifications: NotificationItem[];
}) {
  const [items, setItems] = useState(notifications);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const unreadCount = items.filter((n) => !n.readAt).length;
  const hasUnread = unreadCount > 0;

  function handleOpenChange(open: boolean) {
    // Mark everything read as soon as the dropdown is opened, not on
    // individual item click — matches how a notification bell is
    // normally expected to behave (seeing the list is what clears the
    // badge), and avoids a separate "mark read" click on every item.
    if (open && hasUnread) {
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })));
      startTransition(async () => {
        await markAllNotificationsRead();
        router.refresh();
      });
    }
  }

  return (
    <Popover onOpenChange={handleOpenChange}>
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
        className="w-80 border-border bg-surface p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium text-foreground">
            Notifications
          </h3>
        </div>

        {items.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center px-4 py-6">
            <p className="text-center text-sm text-foreground-muted">
              No notifications yet
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {items.map((n) => (
              <li
                key={n.id}
                className="border-b border-border px-4 py-3 last:border-b-0"
              >
                <p className="text-xs text-foreground-muted mb-1">
                  {n.sender?.name ?? "Bountied"}
                </p>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {n.body}
                </p>
                <p className="text-[11px] text-foreground-muted mt-1 font-mono">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
