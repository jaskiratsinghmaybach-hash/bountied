"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";

const DISMISS_KEY = "payout-warning-dismissed";

export function PayoutWarningBanner({ bankVerified }: { bankVerified: boolean }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (bankVerified) return;
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "true");
  }, [bankVerified]);

  if (bankVerified || dismissed) return null;

  return (
    <div className="rounded-md border border-money/30 bg-money/10 px-4 py-3 flex items-start gap-3 mb-6">
      <AlertTriangle size={16} className="text-money shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          You need to verify your bank details to start withdrawing payout earnings. {" "}
          <Link href="/info/payouts" className="text-accent hover:underline">
            Learn more
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "true");
          setDismissed(true);
        }}
        className="text-foreground-muted hover:text-foreground shrink-0"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
