export function SaveStatusIndicator({ status }: { status: "saved" | "saving" | null }) {
  if (!status) return null;
  return (
    <span className="text-xs text-foreground-muted font-medium animate-in fade-in transition-opacity">
      {status === "saving" ? "Saving…" : "Saved"}
    </span>
  );
}
