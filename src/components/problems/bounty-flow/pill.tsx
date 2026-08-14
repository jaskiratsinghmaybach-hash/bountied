"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_DISABLED_TOOLTIP = "Coming soon — join the waitlist";

export type PillMode = "single" | "multi";

export type PillProps = {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /** Shown on hover when `disabled` is true. */
  disabledTooltip?: string;
  mode?: PillMode;
  onClick?: () => void;
  className?: string;
  /** Optional id for aria wiring from parent step components. */
  id?: string;
};

/**
 * Shared selectable pill for the bounty creation flow — single-select
 * (radio-like) or multi-select (toggle with checkmark). Disabled pills
 * stay visible with muted styling and a hover tooltip.
 */
export function Pill({
  label,
  selected = false,
  disabled = false,
  disabledTooltip = DEFAULT_DISABLED_TOOLTIP,
  mode = "single",
  onClick,
  className,
  id,
}: PillProps) {
  const isMulti = mode === "multi";

  return (
    <span className={cn("relative inline-flex group/pill", className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        aria-disabled={disabled}
        onClick={disabled ? undefined : onClick}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          disabled &&
            "cursor-not-allowed border-border/60 bg-surface/50 text-foreground-muted opacity-60",
          !disabled &&
            !selected &&
            "border-border bg-surface text-foreground hover:border-foreground-muted hover:bg-surface-raised",
          !disabled &&
            selected &&
            isMulti &&
            "border-accent bg-accent/15 text-accent",
          !disabled &&
            selected &&
            !isMulti &&
            "border-accent bg-accent text-background"
        )}
      >
        {isMulti && selected && !disabled && (
          <Check size={14} className="shrink-0" aria-hidden />
        )}
        <span>{label}</span>
      </button>

      {disabled && disabledTooltip && (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max max-w-[220px] -translate-x-1/2",
            "rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-center text-[11px] leading-snug text-foreground-muted shadow-lg",
            "opacity-0 transition-opacity duration-150 group-hover/pill:opacity-100 group-focus-within/pill:opacity-100"
          )}
        >
          {disabledTooltip}
        </span>
      )}
    </span>
  );
}
