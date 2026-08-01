"use client";

import { useState } from "react";

const PILL_AMOUNTS = [50, 100, 250];

export function AddCreditsWidget({ currentBalance }: { currentBalance: number }) {
  const [selected, setSelected] = useState<number>(50);
  const [useCustom, setUseCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [pending, setPending] = useState(false);

  const amount = useCustom ? Number(customValue) : selected;
  const isValid = Number.isFinite(amount) && amount > 0;

  async function handleAddCredits() {
    if (!isValid) return;
    setPending(true);
    const res = await fetch("/api/checkout/create-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json();
    setPending(false);

    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-medium text-foreground">Credit balance</h2>
        <span className="font-mono text-lg font-semibold text-money">
          ${currentBalance.toFixed(2)}
        </span>
      </div>
      <p className="text-xs text-foreground-muted mb-5">
        Top up to fund bounties instantly. A 10% platform fee applies when you
        post a bounty, not when you top up.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {PILL_AMOUNTS.map((value) => {
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
            min={1}
            step="0.01"
            autoFocus
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="500.00"
            className="w-full rounded-md border border-border bg-surface-raised pl-6 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors font-mono"
          />
        </div>
      )}

      <button
        type="button"
        onClick={handleAddCredits}
        disabled={pending || !isValid}
        className="w-full rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors disabled:opacity-60"
      >
        {pending ? "Redirecting…" : `Add $${isValid ? amount.toFixed(2) : "0.00"} via Whop`}
      </button>
    </div>
  );
}
