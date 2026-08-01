"use client";

import { useMemo, useState } from "react";

/**
 * Shown when a Giver tries to fund a bounty and their credit balance falls
 * short. Defaults to the exact shortfall (so one click covers this bounty
 * and nothing more sits idle), but also offers round quick-pick amounts
 * for people who'd rather pre-load their wallet for future bounties, plus
 * a manual amount for anything larger — per product spec.
 */
export function InsufficientCreditsModal({
  required,
  onClose,
  draftProblemId,
}: {
  /** Exact amount still needed (bountyAmount * 1.10, minus current balance already applied server-side, or the full required total — caller decides). */
  required: number;
  onClose: () => void;
  draftProblemId?: string;
}) {
  const exactShortfall = Math.round(required * 100) / 100;

  // Quick-pick pills: the exact shortfall first, then round-number options
  // at or above it so the giver can pre-load extra for next time.
  const pillOptions = useMemo(() => {
    const rounded = [50, 100, 250].filter((v) => v > exactShortfall);
    return [exactShortfall, ...rounded];
  }, [exactShortfall]);

  const [selected, setSelected] = useState<number>(exactShortfall);
  const [customValue, setCustomValue] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [pending, setPending] = useState(false);

  const amount = useCustom ? Number(customValue) : selected;
  const isValid = Number.isFinite(amount) && amount >= exactShortfall && amount > 0;

  async function handleAddCredits() {
    if (!isValid) return;
    setPending(true);
    const res = await fetch("/api/checkout/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, draftProblemId }),
    });
    const data = await res.json();
    setPending(false);

    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight mb-2 text-center">
          Insufficient credits
        </h2>
        <p className="text-sm text-foreground-muted mb-6 text-center">
          You need at least{" "}
          <span className="font-mono text-money">${exactShortfall.toFixed(2)}</span> more to
          post this bounty.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          {pillOptions.map((value, i) => {
            const isFirst = i === 0;
            const isSelected = !useCustom && selected === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setUseCustom(false);
                  setSelected(value);
                }}
                className={`rounded-md border px-3 py-2.5 text-sm font-mono transition-colors ${
                  isSelected
                    ? "border-accent bg-surface-raised text-foreground"
                    : "border-border text-foreground-muted hover:border-foreground-muted"
                }`}
              >
                ${value.toFixed(2)}
                {isFirst && (
                  <span className="block text-[10px] text-foreground-muted mt-0.5 font-sans">
                    exact amount
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setUseCustom(true)}
            className={`rounded-md border px-3 py-2.5 text-sm font-mono transition-colors ${
              useCustom
                ? "border-accent bg-surface-raised text-foreground"
                : "border-border text-foreground-muted hover:border-foreground-muted"
            }`}
          >
            Custom
          </button>
        </div>

        {useCustom && (
          <div className="relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
              $
            </span>
            <input
              type="number"
              min={exactShortfall}
              step="0.01"
              autoFocus
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              placeholder={exactShortfall.toFixed(2)}
              className="w-full rounded-md border border-border bg-surface-raised pl-6 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors font-mono"
            />
          </div>
        )}

        {useCustom && customValue !== "" && !isValid && (
          <p className="text-xs text-danger mb-4 -mt-2">
            Must be at least ${exactShortfall.toFixed(2)}.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleAddCredits}
            disabled={pending || !isValid}
            className="rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors disabled:opacity-60"
          >
            {pending ? "Redirecting…" : `Add $${isValid ? amount.toFixed(2) : "0.00"} via Whop`}
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
