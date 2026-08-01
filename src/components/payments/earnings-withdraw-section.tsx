"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Landmark } from "lucide-react";
import { BankVerificationModal } from "@/components/payments/bank-verification-modal";
import { WithdrawWidget } from "@/components/payments/withdraw-widget";

export function EarningsWithdrawSection({
  bankDetailsAdded,
  availableBalance,
}: {
  bankDetailsAdded: boolean;
  availableBalance: number;
}) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  if (!bankDetailsAdded) {
    return (
      <>
        <div className="rounded-lg border border-border bg-surface p-6 flex flex-col items-center text-center">
          <Landmark size={20} className="text-money mb-3" />
          <p className="text-sm text-foreground mb-1">
            Available balance:{" "}
            <span className="font-mono text-money">${availableBalance.toFixed(2)}</span>
          </p>
          <p className="text-xs text-foreground-muted mb-4 max-w-xs">
            Add your bank details to request a payout. Payouts arrive within 7
            days of requesting.
          </p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors"
          >
            Add bank details
          </button>
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

  return <WithdrawWidget availableBalance={availableBalance} />;
}
