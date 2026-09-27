"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { flowEase, flowTransition } from "../motion";

export type LayoutMode = "pills" | "workspace";

export type WorkspaceLayoutProps = {
  layoutMode: LayoutMode;
  /**
   * Page-level header content (title, subtitle, back-link) to render
   * inside the SAME sticky wrapper as the pill summary strip, so the two
   * form one continuous sticky block with a structurally guaranteed zero
   * gap — no second sticky element, no JS-measured height, nothing that
   * can drift out of sync between them.
   */
  header?: ReactNode;
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
  header,
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
            {/* ── Sticky header + summary strip, ONE element ──────────────
                header (title/subtitle/back-link) and the pill summary
                strip render inside a single sticky wrapper instead of two
                independently-positioned sticky elements synced through a
                JS-measured CSS variable. Two sticky elements relying on a
                measured height to butt together will always have a window
                (before the measurement effect runs, or after any reflow
                the observer hasn't caught yet) where they can drift apart
                and let scrolled content show through the gap. One sticky
                element has no seam to open in the first place. */}
            {(header || summaryStrip || saveStatus) && (
              <div className="sticky top-0 z-20 bg-background border-b border-border">
                {header && (
                  <div className="pt-8 pb-4 px-6 sm:px-10 border-b border-border/20">
                    {header}
                  </div>
                )}
                {(summaryStrip || saveStatus) && (
                  <div className="px-6 sm:px-10 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                      {summaryStrip}
                    </div>
                    {saveStatus}
                  </div>
                )}
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
            className="flex flex-col gap-0 w-full"
          >
            {header && (
              <div className="pt-8 pb-4 px-6 sm:px-10 border-b border-border/20">
                {header}
              </div>
            )}
            <div className="px-6 sm:px-10 py-8 flex flex-col gap-6 w-full">
              {pillPhase}
            </div>
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
