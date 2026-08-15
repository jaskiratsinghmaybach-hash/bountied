"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/toggle";

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
  /**
   * Render element type: defaults to 'button' for interactive usage,
   * or 'span' when used inside another clickable container or purely presentational.
   */
  as?: "button" | "span";
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
  as: Component = "button",
}: PillProps) {
  const isMulti = mode === "multi";
  const isInteractive = Component === "button";

  const styleClasses = cn(
    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
    isInteractive &&
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong",
    disabled &&
      "cursor-not-allowed border-border/60 bg-surface/50 text-foreground-muted opacity-60",
    !disabled &&
      !selected &&
      "border-border bg-surface text-foreground hover:border-foreground-muted hover:bg-surface-raised",
    !disabled &&
      selected &&
      "bg-foreground text-background border-2 border-border-strong"
  );

  const content = (
    <>
      {isMulti && selected && !disabled && (
        <Check size={14} className="shrink-0" aria-hidden />
      )}
      <span>{label}</span>
    </>
  );

  return (
    <span className={cn("relative inline-flex group/pill", className)}>
      {isInteractive ? (
        <Toggle
          id={id}
          disabled={disabled}
          pressed={selected}
          onClick={disabled ? undefined : onClick}
          className={cn(styleClasses, "h-auto p-0 min-w-0 font-medium hover:bg-none hover:text-inherit data-[state=on]:bg-foreground data-[state=on]:text-background")}
        >
          {content}
        </Toggle>
      ) : (
        <span id={id} className={styleClasses}>
          {content}
        </span>
      )}

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