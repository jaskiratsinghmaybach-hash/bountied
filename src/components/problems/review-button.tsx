"use client";

import { useState } from "react";
import { triggerSubmissionReview } from "@/lib/reviews/actions";
import { FREE_REVIEWS_PER_PROBLEM } from "@/lib/reviews/pricing";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const SKIP_CONFIRM_KEY = "bountied:review-skip-confirm";

interface ReviewButtonProps {
  submissionId: string;
  giverId: string;
  freeReviewsLeft: number;
  status: string;
}

export function ReviewButton({
  submissionId,
  giverId,
  freeReviewsLeft,
  status,
}: ReviewButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [insufficientFunds, setInsufficientFunds] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const isFree = freeReviewsLeft > 0;

  async function executeReview() {
    setLoading(true);
    setInsufficientFunds(false);
    setError(null);

    try {
      await triggerSubmissionReview(submissionId, giverId);

      const res = await fetch("/api/sandbox/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });

      if (!res.ok) throw new Error("Sandbox execution failed");

      router.refresh();
    } catch (err: any) {
      if (err.message === "INSUFFICIENT_FUNDS") {
        setInsufficientFunds(true);
      } else {
        setError("An error occurred while executing the sandbox.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleReview() {
    if (isFree) {
      executeReview();
      return;
    }

    const skipConfirm =
      typeof window !== "undefined" &&
      localStorage.getItem(SKIP_CONFIRM_KEY) === "true";

    if (skipConfirm) {
      executeReview();
      return;
    }

    setShowDialog(true);
  }

  function handleConfirm() {
    if (dontAskAgain) {
      localStorage.setItem(SKIP_CONFIRM_KEY, "true");
    }
    setShowDialog(false);
    executeReview();
  }

  if (status !== "AWAITING_REVIEW") {
    return null;
  }

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        {insufficientFunds && (
          <p className="text-xs text-danger">
            Insufficient wallet balance.{" "}
            <Link
              href="/dashboard/giver/funds"
              className="underline hover:opacity-80"
            >
              Add funds
            </Link>
          </p>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          onClick={handleReview}
          disabled={loading}
          className="rounded-md bg-primary text-background font-medium px-4 py-2 text-sm hover:bg-primary/80 transition-colors disabled:opacity-60"
        >
          {loading
            ? "Running sandbox…"
            : isFree
              ? "Run sandbox review (free)"
              : "Run sandbox review ($0.04)"}
        </button>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Paid sandbox review</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-foreground-muted">
              You have used all {FREE_REVIEWS_PER_PROBLEM} free reviews for this
              challenge. Executing this sandbox review will deduct{" "}
              <span className="font-mono text-foreground">$0.04</span> from your
              wallet. Continue?
            </p>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                className="rounded border-border accent-foreground"
              />
              <span className="text-xs text-foreground-muted">
                Don&apos;t ask me again
              </span>
            </label>
          </div>
          <DialogFooter className="mt-2">
            <button
              type="button"
              onClick={() => setShowDialog(false)}
              className="rounded-md border border-border px-4 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-md bg-primary text-background font-medium px-4 py-2 text-sm hover:bg-primary/80 transition-colors"
            >
              Proceed
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
