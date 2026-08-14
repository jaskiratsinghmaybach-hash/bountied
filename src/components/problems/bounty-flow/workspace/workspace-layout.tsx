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
            className="flex flex-col gap-8"
          >
            {(summaryStrip || saveStatus) && (
              <div className="sticky top-0 z-10 -mx-1 px-1 py-3 bg-background/95 backdrop-blur-sm border-b border-border flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
                  {summaryStrip}
                </div>
                {saveStatus}
              </div>
            )}

            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:gap-12 lg:items-start">
              <section aria-label="Primary spec" className="flex flex-col gap-6">
                {tier1}
              </section>

              <div className="flex flex-col gap-10">
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

            {footer && (
              <div className="pt-4 border-t border-border sticky bottom-0 bg-background/95 backdrop-blur-sm -mx-1 px-1 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="pills"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={flowTransition}
            className="flex flex-col gap-6 max-w-2xl"
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
