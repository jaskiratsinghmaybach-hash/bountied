"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WhopCheckoutEmbed } from "@whop/checkout/react";
import { retryFundDraft } from "@/lib/problems/create-actions";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

type Phase = "picking" | "checkout" | "confirming" | "error";

/**
 * Shown when a Giver tries to fund a bounty and their credit balance falls
 * short. Defaults to the exact shortfall (so one click covers this bounty
 * and nothing more sits idle), but also offers round quick-pick amounts
 * for people who'd rather pre-load their wallet for future bounties, plus
 * a manual amount for anything larger — per product spec.
 *
 * On completion, the embedded checkout's onComplete is a UI cue only —
 * the real credit lands via the signature-verified webhook. This polls
 * /api/checkout/status until the balance actually reflects the top-up,
 * then retries funding the draft problem automatically.
 */
export function InsufficientCreditsModal({
  required,
  onClose,
  draftProblemId,
}: {
  /** Shortfall — amount still needed on top of current balance. */
  required: number;
  onClose: () => void;
  draftProblemId?: string;
}) {
  const router = useRouter();
  const exactShortfall = Math.round(required * 100) / 100;

  const pillOptions = useMemo(() => {
    const rounded = [50, 100, 250].filter((v) => v > exactShortfall);
    return [exactShortfall, ...rounded];
  }, [exactShortfall]);

  const [selected, setSelected] = useState<number>(exactShortfall);
  const [customValue, setCustomValue] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [phase, setPhase] = useState<Phase>("picking");
  const [planId, setPlanId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const amount = useCustom ? Number(customValue) : selected;
  const isValid = Number.isFinite(amount) && amount >= exactShortfall && amount > 0;

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
        body: JSON.stringify({ amount, draftProblemId }),
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
    setPhase("confirming");
    const startedAt = Date.now();

    pollTimer.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        if (pollTimer.current) clearInterval(pollTimer.current);
        setPhase("error");
        setErrorMessage(
          "Payment received, but it's taking longer than usual to confirm. Refresh the page in a moment — your bounty will fund automatically."
        );
        return;
      }

      const res = await fetch("/api/checkout/status");
      if (!res.ok) return;
      const data = await res.json();

      // Balance grew by at least the shortfall — enough to retry funding.
      if (Number(data.creditBalance) >= exactShortfall) {
        if (pollTimer.current) clearInterval(pollTimer.current);

        if (draftProblemId) {
          const result = await retryFundDraft(draftProblemId);
          if ("ok" in result) {
            router.push(`/dashboard/giver/problems/${draftProblemId}`);
            return;
          }
        }

        router.refresh();
        onClose();
      }
    }, POLL_INTERVAL_MS);
  }

  if (phase === "checkout" && planId) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4 py-6">
        <div className="w-full max-w-md max-h-full rounded-lg border border-border bg-surface flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h2 className="text-sm font-medium text-foreground">Add ${amount.toFixed(2)}</h2>
            <button
              type="button"
              onClick={() => {
                setPhase("picking");
                setPlanId(null);
              }}
              className="text-xs text-foreground-muted hover:text-foreground transition-colors"
            >
              Back
            </button>
          </div>
          <div className="overflow-y-auto p-6">
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
        </div>
      </div>
    );
  }

  if (phase === "confirming") {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
        <div className="w-full max-w-sm rounded-lg border border-money/30 bg-emerald-500/10 p-6 text-center">
          <p className="text-sm text-foreground mb-1">Payment received</p>
          <p className="text-xs text-foreground-muted">Funding your bounty…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight mb-2 text-center">
          Insufficient credits
        </h2>
        <p className="text-sm text-foreground-muted mb-6 text-center">
          You need at least{" "}
          <span className="font-mono text-emerald-500">${exactShortfall.toFixed(2)}</span> more to
          post this bounty.
        </p>

        {errorMessage && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger mb-4">
            {errorMessage}
          </p>
        )}

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
            onClick={handleStartCheckout}
            disabled={!isValid || phase === "checkout"}
            className="rounded-md bg-primary text-background font-medium px-5 py-2.5 text-sm hover:bg-primary/80 transition-colors disabled:opacity-60"
          >
            {phase === "checkout" && !planId
              ? "Loading…"
              : `Add $${isValid ? amount.toFixed(2) : "0.00"}`}
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