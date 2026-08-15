'use client';

import { useEffect, useRef, useState } from "react";
import { WhopCheckoutEmbed } from "@whop/checkout/react";
import { useRouter } from "next/navigation";

const PILL_AMOUNTS = [50, 100, 250];
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

type Phase = "idle" | "checkout" | "confirming" | "error";

export function AddCreditsWidget({ currentBalance }: { currentBalance: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number>(50);
  const [useCustom, setUseCustom] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [planId, setPlanId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const amount = useCustom ? Number(customValue) : selected;
  const isValid = Number.isFinite(amount) && amount > 0;

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  async function handleStartCheckout() {
    if (!isValid) return;
    setPhase("checkout");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();

      if (!res.ok || !data.planId) {
        setPhase("error");
        setErrorMessage(data.error ?? "Could not start checkout. Try again.");
        return;
      }

      setPlanId(data.planId);
    } catch {
      setPhase("error");
      setErrorMessage("Could not reach the server. Check your connection and try again.");
    }
  }

  function handleCheckoutComplete() {
    // onComplete firing means the CLIENT saw a successful payment — the
    // actual balance update only happens once Whop's webhook lands
    // server-side (signature-verified). Poll until it does.
    setPhase("confirming");
    const startedAt = Date.now();
    const startingBalance = currentBalance;

    pollTimer.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setPhase("error");
        setErrorMessage(
          "Payment received, but your balance is taking longer than usual to update. Refresh in a moment — it will land."
        );
        return;
      }

      const res = await fetch("/api/checkout/status");
      if (!res.ok) return;
      const data = await res.json();

      if (Number(data.creditBalance) > startingBalance) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        router.refresh();
        setPhase("idle");
        setPlanId(null);
      }
    }, POLL_INTERVAL_MS);
  }

  if (phase === "checkout" && planId) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-foreground">Add ${amount.toFixed(2)}</h2>
          <button
            type="button"
            onClick={() => {
              setPhase("idle");
              setPlanId(null);
            }}
            className="text-xs text-foreground-muted hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
        <WhopCheckoutEmbed
          planId={planId}
          theme="dark"
          skipRedirect
          fallback={
            <div className="h-[420px] w-full animate-pulse rounded-md bg-surface-raised" />
          }
          onComplete={handleCheckoutComplete}
        />
      </div>
    );
  }

  if (phase === "confirming") {
    return (
      <div className="rounded-lg border border-money/30 bg-emerald-500/10 p-6 text-center">
        <p className="text-sm text-foreground mb-1">Payment received</p>
        <p className="text-xs text-foreground-muted">Updating your balance…</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-medium text-foreground">Credit balance</h2>
        <span className="font-mono text-lg font-semibold text-emerald-500">
          ${currentBalance.toFixed(2)}
        </span>
      </div>
      <p className="text-xs text-foreground-muted mb-5">
        Top up to fund bounties instantly. A 10% platform fee applies when you
        post a bounty, not when you top up.
      </p>

      {errorMessage && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger mb-4">
          {errorMessage}
        </p>
      )}

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
        onClick={handleStartCheckout}
        disabled={!isValid || phase === "checkout"}
        className="w-full rounded-md bg-primary text-background font-medium px-5 py-2.5 text-sm hover:bg-primary/80 transition-colors disabled:opacity-60"
      >
        {phase === "checkout" && !planId
          ? "Loading…"
          : `Add $${isValid ? amount.toFixed(2) : "0.00"}`}
      </button>
    </div>
  );
}
