"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { flowEnter, flowTransition } from "./motion";

export type FlowStepProps = {
  /** Stable id for keys / aria. */
  stepId: string;
  /** Question label shown above expanded content (matches existing form labels). */
  question: string;
  /** One-line answer shown when collapsed. Omit until the step is answered. */
  summary?: ReactNode;
  /** Step has a committed answer — may render collapsed summary. */
  answered: boolean;
  /** Full step UI is open (live question or re-editing a prior answer). */
  expanded: boolean;
  /** Step has been reached in the sequence — false hides the step entirely. */
  visible: boolean;
  /** Click collapsed summary to re-expand for editing. */
  onExpand: () => void;
  children: ReactNode;
  className?: string;
};

/**
 * Collapse/expand wrapper for one pill-phase question. The orchestrator
 * owns answered/expanded/visible; this component handles motion + layout.
 */
export function FlowStep({
  stepId,
  question,
  summary,
  answered,
  expanded,
  visible,
  onExpand,
  children,
  className,
}: FlowStepProps) {
  if (!visible) return null;

  const showCollapsed = answered && !expanded && summary != null;

  return (
    <div className={cn("w-full", className)} data-step={stepId}>
      <AnimatePresence mode="wait" initial={false}>
        {showCollapsed ? (
          <motion.div
            key={`${stepId}-collapsed`}
            role="button"
            tabIndex={0}
            onClick={onExpand}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onExpand();
              }
            }}
            {...flowEnter}
            className={cn(
              "group w-full cursor-pointer text-left rounded-lg border border-border bg-surface-raised px-4 py-3",
              "flex items-center justify-between gap-3 transition-colors",
              "hover:border-foreground-muted hover:bg-surface focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            )}
            aria-expanded={false}
            aria-label={`Edit ${question}`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted mb-0.5">
                {question}
              </p>
              <div className="text-sm text-foreground truncate">{summary}</div>
            </div>
            <Pencil
              size={14}
              className="shrink-0 text-foreground-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              aria-hidden
            />
          </motion.div>
        ) : (
          <motion.div
            key={`${stepId}-expanded`}
            initial={flowEnter.initial}
            animate={flowEnter.animate}
            exit={flowEnter.exit}
            transition={flowTransition}
            aria-expanded
          >
            <p className="text-xs text-foreground-muted uppercase tracking-wide mb-3">
              {question}
            </p>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Temporary stand-in content for step 2 — replaced by real step components
 * in steps 3+. Exported so the orchestrator can smoke-test layout early.
 */
export function FlowStepPlaceholder({ text = "Placeholder content" }: { text?: string }) {
  return (
    <p className="rounded-md border border-dashed border-border bg-surface px-4 py-6 text-sm text-foreground-muted">
      {text}
    </p>
  );
}