"use client";

import { useActionState } from "react";
import {
  saveBankDetails,
  type SaveBankDetailsResult,
} from "@/lib/payouts/bank-details-actions";
import { SUPPORTED_COUNTRIES } from "@/lib/payments/bank-fields";

const initialState: SaveBankDetailsResult | undefined = undefined;

/**
 * v1: collects bank details directly, stores them as-given (no external
 * verification API — see lib/payouts/bank-details-actions.ts). The
 * platform admin reviews these manually before wiring any payout.
 * Kept as "BankVerificationModal" since that's what callers import, but
 * there's no verification step happening here in v1, just collection.
 */
export function BankVerificationModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveBankDetails, initialState);

  if (state && "ok" in state) {
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight mb-1">Add bank details</h2>
        <p className="text-sm text-foreground-muted mb-6">
          Required before you can request a payout. Your first payout arrives
          within 7 days of requesting it.
        </p>

        {state && "error" in state && (
          <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger mb-4">
            {state.error}
          </p>
        )}

        <form action={formAction} className="flex flex-col gap-4">
          <div>
            <label htmlFor="legalName" className="block text-xs text-foreground-muted mb-1.5">
              Full legal name{" "}
              <span className="text-foreground-muted">(must match your bank account)</span>
            </label>
            <input
              id="legalName"
              name="legalName"
              required
              minLength={3}
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
            />
            <p className="text-[11px] text-foreground-muted mt-1">
              Do not enter a username or nickname — payouts are rejected if this
              doesn&apos;t match your official banking records.
            </p>
          </div>

          <div>
            <label htmlFor="bankCountry" className="block text-xs text-foreground-muted mb-1.5">
              Country
            </label>
            <select
              id="bankCountry"
              name="bankCountry"
              required
              defaultValue=""
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
            >
              <option value="" disabled>
                Select country
              </option>
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="bankAccountNumber"
              className="block text-xs text-foreground-muted mb-1.5"
            >
              Account number
            </label>
            <input
              id="bankAccountNumber"
              name="bankAccountNumber"
              required
              minLength={4}
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors font-mono"
            />
          </div>

          <div>
            <label
              htmlFor="bankIfscOrSwift"
              className="block text-xs text-foreground-muted mb-1.5"
            >
              IFSC / SWIFT / BIC code
            </label>
            <input
              id="bankIfscOrSwift"
              name="bankIfscOrSwift"
              required
              minLength={4}
              className="w-full rounded-md border border-border bg-surface-raised px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors font-mono"
            />
          </div>

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border text-foreground text-sm font-medium px-4 py-2.5 hover:bg-surface-raised transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-md bg-accent text-background font-medium px-4 py-2.5 text-sm hover:bg-accent-dim transition-colors disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save details"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
