"use client";

import { useState } from "react";

export function InsufficientCreditsModal({
  required,
  onClose,
  draftProblemId,
}: {
  required: number;
  onClose: () => void;
  draftProblemId?: string;
}) {
  const [pending, setPending] = useState(false);

  async function handleAddCredits() {
    setPending(true);
    const res = await fetch("/api/checkout/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: required, draftProblemId }),
    });
    const data = await res.json();
    setPending(false);

    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 text-center">
        <h2 className="text-lg font-semibold tracking-tight mb-2">Insufficient credits</h2>
        <p className="text-sm text-foreground-muted mb-6">
          Insufficient credit balance to post this bounty (${required.toFixed(2)} required).
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleAddCredits}
            disabled={pending}
            className="rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors disabled:opacity-60"
          >
            {pending ? "Redirecting…" : "Add Credits via Whop"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-foreground-muted hover:text-foreground transition-colors py-2"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
