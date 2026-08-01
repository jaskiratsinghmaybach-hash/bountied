"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { BankVerificationModal } from "@/components/payments/bank-verification-modal";

export function SettingsPayoutSection({
  bankVerified,
  availableBalance,
}: {
  bankVerified: boolean;
  availableBalance: number;
}) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className="rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium text-foreground">Payouts</h2>
          {bankVerified ? (
            <span className="flex items-center gap-1.5 text-xs text-money">
              <ShieldCheck size={14} />
              Bank verified
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-foreground-muted">
              <ShieldAlert size={14} />
              Not verified
            </span>
          )}
        </div>
        <p className="text-xs text-foreground-muted mb-5">
          Available balance:{" "}
          <span className="font-mono text-money">${availableBalance.toFixed(2)}</span> · A 5%
          platform fee applies at withdrawal.
        </p>

        {bankVerified ? (
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
            className="rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors"
          >
            Verify bank account
          </button>
        )}
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
