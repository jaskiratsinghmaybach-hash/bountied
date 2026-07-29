import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Use sparingly — true renders the value in the money/accent color, for the one number that matters most on a given dashboard */
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-foreground-muted uppercase tracking-wide">
          {label}
        </span>
        <Icon size={16} className="text-foreground-muted" />
      </div>
      <p
        className={`font-mono text-2xl font-semibold ${
          accent ? "text-money" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
