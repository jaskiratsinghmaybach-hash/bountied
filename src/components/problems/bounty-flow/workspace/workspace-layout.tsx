"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { flowEase, flowTransition } from "../motion";

export type LayoutMode = "pills" | "workspace";

export type WorkspaceLayoutProps = {
  layoutMode: LayoutMode;
  /** Sequential pill steps — visible only in pills mode. */
  pillPhase?: ReactNode;
  /** Collapsed pill-phase answers — sticky when in workspace mode. */
  summaryStrip?: ReactNode;
  /** Optional save indicator slot beside the summary strip (§13.4). */
  saveStatus?: ReactNode;
  tier1: ReactNode;
  tier2: ReactNode;
  tier3: ReactNode;
  rightPanel?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function WorkspaceLayout({
  layoutMode,
  pillPhase,
  summaryStrip,
  saveStatus,
  tier1,
  tier2,
  tier3,
  rightPanel,
  footer,
  className,
}: WorkspaceLayoutProps) {
  const isWorkspace = layoutMode === "workspace";

  return (
    <div className={cn("w-full", className)}>
      <AnimatePresence mode="wait">
        {isWorkspace ? (
          <motion.div
            key="workspace"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ ...flowTransition, ease: flowEase }}
            className="flex flex-col gap-0"
          >
            {/* ── Sticky summary strip ─────────────────────────────────── */}
            {(summaryStrip || saveStatus) && (
              <div className="sticky top-0 z-20 px-6 sm:px-10 py-3 bg-background/95 backdrop-blur-sm border-b border-border flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                  {summaryStrip}
                </div>
                {saveStatus}
              </div>
            )}

            <div className="px-6 sm:px-10 py-8 grid grid-cols-1 xl:grid-cols-[3fr_1fr] gap-10 xl:gap-12">

              {/* ── Main Scrollable Content ────────────────────────────── */}
              <div className="min-w-0 flex flex-col gap-10">
                {/* ── Tier 1: Title + Description — full width ─────────────── */}
                <section aria-label="Primary spec">
                  {tier1}
                </section>

                {/* ── Tier 2 + 3: Balanced side-by-side grid ───────────────── */}
                <div className="grid gap-10 md:grid-cols-2 md:gap-12 items-start pt-8 border-t border-border">
                  <section aria-label="Reference material" className="flex flex-col gap-6">
                    <WorkspaceSectionHeading>Reference material</WorkspaceSectionHeading>
                    {tier2}
                  </section>

                  <section aria-label="Metadata" className="flex flex-col gap-6">
                    <WorkspaceSectionHeading>Details</WorkspaceSectionHeading>
                    {tier3}
                  </section>
                </div>
              </div>

              {/* ── Sticky Right Panel — grid handles width via 1fr ──────── */}
              <div className="xl:sticky xl:top-14 self-start flex flex-col gap-8">
                {rightPanel}
                {footer && (
                  <div className="pt-6 border-t border-border flex flex-col gap-4">
                    {footer}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="pills"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={flowTransition}
            className="px-6 sm:px-10 py-8 flex flex-col gap-6 w-full"
          >
            {pillPhase}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WorkspaceSectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
      {children}
    </h2>
  );
}
