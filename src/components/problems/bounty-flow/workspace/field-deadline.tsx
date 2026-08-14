import { Pill } from "../pill";

export type DeadlinePreset = "none" | "1w" | "2w" | "1m" | "custom";

type FieldDeadlineProps = {
  preset: DeadlinePreset | null;
  onPresetChange: (preset: DeadlinePreset) => void;
  customDate: string;
  onCustomDateChange: (date: string) => void;
};

export function FieldDeadline({
  preset,
  onPresetChange,
  customDate,
  onCustomDateChange,
}: FieldDeadlineProps) {
  function handlePreset(p: DeadlinePreset) {
    onPresetChange(p);
    if (p !== "custom") {
      let d = new Date();
      if (p === "1w") d.setDate(d.getDate() + 7);
      if (p === "2w") d.setDate(d.getDate() + 14);
      if (p === "1m") d.setMonth(d.getMonth() + 1);
      if (p !== "none") {
        onCustomDateChange(d.toISOString().split("T")[0]);
      } else {
        onCustomDateChange("");
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="block text-xs font-medium uppercase tracking-wide text-foreground-muted mb-2">Deadline</label>
      <div className="flex flex-wrap gap-2">
        <Pill mode="single" selected={preset === "none"} onClick={() => handlePreset("none")} disabled={false} label="No deadline" />
        <Pill mode="single" selected={preset === "1w"} onClick={() => handlePreset("1w")} disabled={false} label="1 week" />
        <Pill mode="single" selected={preset === "2w"} onClick={() => handlePreset("2w")} disabled={false} label="2 weeks" />
        <Pill mode="single" selected={preset === "1m"} onClick={() => handlePreset("1m")} disabled={false} label="1 month" />
        <Pill mode="single" selected={preset === "custom"} onClick={() => handlePreset("custom")} disabled={false} label="Custom" />
      </div>
      {preset === "custom" && (
        <input
          type="date"
          name="deadline"
          value={customDate}
          onChange={(e) => onCustomDateChange(e.target.value)}
          className="w-full sm:w-64 rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
        />
      )}
      {preset !== "custom" && customDate && <input type="hidden" name="deadline" value={customDate} />}
    </div>
  );
}
