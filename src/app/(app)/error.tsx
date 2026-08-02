"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Catches any uncaught error thrown while rendering a route under (app) —
 * including errors surfaced from Server Actions that don't return a typed
 * error result. Without this, an uncaught exception shows the user Next's
 * raw dev overlay (or, in production, a blank unstyled crash) instead of a
 * recoverable screen.
 *
 * This does NOT replace typed error returns from Server Actions (e.g.
 * CreateProblemResult's { error: string } branch) — that's still the
 * right pattern for expected failures the user should understand and act
 * on. This is the safety net for the unexpected ones.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Uncaught error in (app):", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <AlertTriangle size={20} className="text-danger mx-auto mb-4" />
        <h1 className="text-lg font-semibold tracking-tight text-foreground mb-1.5">
          Something went wrong
        </h1>
        <p className="text-sm text-foreground-muted mb-6">
          That didn&apos;t work as expected. Nothing was charged or changed
          unless you saw a confirmation.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-accent text-background font-medium px-5 py-2.5 text-sm hover:bg-accent-dim transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard/giver"
            className="rounded-md border border-border text-foreground text-sm font-medium px-5 py-2.5 hover:bg-surface-raised transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}