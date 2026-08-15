"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Landmark, CircleAlert } from "lucide-react";
import { BankVerificationModal } from "@/components/payments/bank-verification-modal";

export function SettingsPayoutSection({
  bankDetailsAdded,
  availableBalance,
}: {
  bankDetailsAdded: boolean;
  availableBalance: number;
}) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium text-foreground">Payouts</h2>
          {bankDetailsAdded ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-500">
              <Landmark size={14} />
              Bank details added
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
              <CircleAlert size={14} />
              No bank details
            </span>
          )}
        </div>
        <p className="text-xs text-foreground-muted mb-5">
          Available balance:{" "}
          <span className="font-mono text-emerald-500">${availableBalance.toFixed(2)}</span> · A 5%
          platform fee applies at withdrawal · payouts arrive within 7 days.
        </p>

        {bankDetailsAdded ? (
          <Link
            href="/dashboard/solver/earnings"
            className="inline-block rounded-md border border-border text-foreground text-sm font-medium px-4 py-2.5 hover:bg-surface-raised transition-colors"
          >
            Go to earnings & withdraw
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-md bg-primary text-background font-medium px-5 py-2.5 text-sm hover:bg-primary/80 transition-colors"
          >
            Add bank details
          </button>
        )}
      </div>

      {showModal && (
        <BankVerificationModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
