"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { BankVerificationModal } from "@/components/payments/bank-verification-modal";
import { WithdrawWidget } from "@/components/payments/withdraw-widget";

export function EarningsWithdrawSection({
  bankVerified,
  availableBalance,
}: {
  bankVerified: boolean;
  availableBalance: number;
}) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  if (!bankVerified) {
    return (
      <>
        <div className="rounded-lg border border-border bg-surface p-6 flex flex-col items-center text-center">
          <ShieldCheck size={20} className="text-money mb-3" />
          <p className="text-sm text-foreground mb-1">
            Available balance:{" "}
            <span className="font-mono text-money">${availableBalance.toFixed(2)}</span>
          </p>
          <p className="text-xs text-foreground-muted mb-4 max-w-xs">
            Verify your bank account to withdraw. This only takes a minute.
          </p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors"
          >
            Verify bank account
          </button>
        </div>

        {showModal && (
          <BankVerificationModal
            onClose={() => setShowModal(false)}
            onVerified={() => {
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
