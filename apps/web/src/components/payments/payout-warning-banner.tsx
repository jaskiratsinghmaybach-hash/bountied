"use client";

import { useSyncExternalStore } from "react";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";

const DISMISS_KEY = "payout-warning-dismissed";
const DISMISS_EVENT = "bountied:payout-warning-dismissed-change";

function subscribeToDismissal(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DISMISS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getDismissedSnapshot() {
  return window.sessionStorage.getItem(DISMISS_KEY) === "true";
}

function getServerDismissedSnapshot() {
  return false;
}

export function PayoutWarningBanner({ bankDetailsAdded }: { bankDetailsAdded: boolean }) {
  const dismissed = useSyncExternalStore(
    subscribeToDismissal,
    getDismissedSnapshot,
    getServerDismissedSnapshot
  );

  if (bankDetailsAdded || dismissed) return null;

  return (
    <div className="rounded-md border border-money/30 bg-emerald-500/10 px-4 py-3 flex items-start gap-3 mb-6">
      <AlertTriangle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          Add your bank details to start requesting payouts. {" "}
          <Link href="/settings" className="text-primary hover:underline">
            Add now
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "true");
          window.dispatchEvent(new Event(DISMISS_EVENT));
        }}
        className="text-foreground-muted hover:text-foreground shrink-0"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
