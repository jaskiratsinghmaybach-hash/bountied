"use client";

import { useState } from "react";
import { triggerSubmissionReview } from "@/lib/reviews/actions";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

  const isFree = freeReviewsLeft > 0;

  async function handleReview() {
    if (!isFree) {
      const confirmed = confirm(
        "You have used all free reviews for this challenge. Executing this sandbox review will deduct .04 from your wallet. Continue?"
      );
      if (!confirmed) return;
    }

    setLoading(true);

    try {
      await triggerSubmissionReview(submissionId, giverId);

      // Trigger actual execution API
      const res = await fetch("/api/sandbox/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });

      if (!res.ok) throw new Error("Sandbox execution failed");

      router.refresh();
    } catch (error: any) {
      if (error.message === "INSUFFICIENT_FUNDS") {
        alert("Insufficient wallet balance. Please add funds to your wallet.");
        router.push("/dashboard/giver/wallet");
      } else {
        alert("An error occurred while executing the sandbox.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (status !== "AWAITING_REVIEW") {
    return null;
  }

  return (
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
  );
}