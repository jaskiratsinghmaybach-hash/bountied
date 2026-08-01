"use client";

import { useActionState, useState } from "react";
import { withdrawEarnings, type WithdrawActionResult } from "@/lib/payouts/actions";

const initialState: WithdrawActionResult | undefined = undefined;

export function WithdrawWidget({ availableBalance }: { availableBalance: number }) {
  const [state, formAction, pending] = useActionState(withdrawEarnings, initialState);
  const [amountInput, setAmountInput] = useState(String(availableBalance.toFixed(2)));

  const amount = Number(amountInput);
  const isValid = Number.isFinite(amount) && amount > 0 && amount <= availableBalance;
  const fee = isValid ? amount * 0.05 : 0;
  const payout = isValid ? amount - fee : 0;

  if (state && "ok" in state) {
    const eligibleDate = new Date(state.eligibleAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
    });
    return (
      <div className="rounded-lg border border-money/30 bg-money/10 p-6 text-center">
        <p className="text-sm text-foreground mb-1">Payout requested</p>
        <p className="font-mono text-2xl font-semibold text-money mb-1">
          ${state.payoutAmount.toFixed(2)}
        </p>
        <p className="text-xs text-foreground-muted">
          Will be sent to your bank account by {eligibleDate}.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-medium text-foreground">Available balance</h2>
        <span className="font-mono text-lg font-semibold text-money">
          ${availableBalance.toFixed(2)}
        </span>
      </div>
      <p className="text-xs text-foreground-muted mb-5">
        A 5% platform fee applies. Payouts are sent within 7 days of request.
      </p>

      {state && "error" in state && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger mb-4">
          {state.error}
        </p>
      )}

      <label htmlFor="amount" className="block text-xs text-foreground-muted mb-1.5">
        Amount to withdraw
      </label>
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-muted">
          $
        </span>
        <input
          id="amount"
          name="amount"
          type="number"
          min={0.01}
          max={availableBalance}
          step="0.01"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          className="w-full rounded-md border border-border bg-surface-raised pl-6 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors font-mono"
        />
      </div>

      {isValid && (
        <div className="flex flex-col gap-1.5 text-xs font-mono mb-5">
          <div className="flex justify-between text-foreground-muted">
            <span>Withdrawal amount</span>
            <span>${amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-foreground-muted">
            <span>Platform fee (5%)</span>
            <span>−${fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-foreground font-semibold pt-1.5 border-t border-border">
            <span>You&apos;ll receive</span>
            <span className="text-money">${payout.toFixed(2)}</span>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !isValid || availableBalance <= 0}
        className="w-full rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors disabled:opacity-60"
      >
        {pending ? "Requesting…" : "Request payout"}
      </button>
    </form>
  );
}
