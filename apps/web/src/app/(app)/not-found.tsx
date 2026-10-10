import Link from "next/link";
import { FileQuestion } from "lucide-react";

/**
 * Renders whenever notFound() is called (or an unmatched route hits)
 * anywhere under (app) — e.g. a problem ID that doesn't exist or isn't
 * yours to view/edit (see .../problems/[id]/edit/page.tsx's giverId
 * check). Without this, Next falls back to its plain unstyled default
 * 404, which doesn't match the rest of the product and gives the person
 * nowhere to go from there.
 *
 * Mirrors error.tsx's layout/tone on purpose — a 404 and an uncaught
 * error are both "this didn't work, here's your way out" moments and
 * should look like the same family of screen, not two different design
 * languages colliding.
 */
export default function AppNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <FileQuestion size={20} className="text-foreground-muted mx-auto mb-4" />
        <h1 className="text-lg font-semibold tracking-tight text-foreground mb-1.5">
          Page not found
        </h1>
        <p className="text-sm text-foreground-muted mb-6">
          This page doesn&apos;t exist, or it&apos;s not available to you —
          it may have been removed, funded, or belongs to someone else.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/dashboard/giver"
            className="rounded-md bg-primary text-background font-medium px-5 py-2.5 text-sm hover:bg-primary/80 transition-colors"
          >
            Back to dashboard
          </Link>
          <Link
            href="/problems"
            className="rounded-md border border-border text-foreground text-sm font-medium px-5 py-2.5 hover:bg-surface-raised transition-colors"
          >
            Browse bounties
          </Link>
        </div>
      </div>
    </div>
  );
}
