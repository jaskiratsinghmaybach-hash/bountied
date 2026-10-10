import type { ReactNode } from "react";

export function Panel({ title, actions, children, className = "" }: {
  title: string; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col bg-panel ${className}`}>
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
        <div className="flex items-center gap-1">{actions}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "active";
const TONES: Record<Tone, string> = {
  neutral: "text-muted border-line",
  ok: "text-ok border-ok/30 bg-ok/10",
  warn: "text-warn border-warn/30 bg-warn/10",
  bad: "text-bad border-bad/30 bg-bad/10",
  active: "text-accent border-accent/30 bg-accent/10",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[11px] leading-4 ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const STATUS: Record<string, [string, Tone]> = {
  SUBMITTED: ["Submitted", "neutral"], AWAITING_REVIEW: ["Ready to review", "active"],
  RUNNING: ["Running", "active"], UNDER_REVIEW: ["Evidence ready", "ok"],
  ACCEPTED: ["Accepted", "ok"], REJECTED: ["Rejected", "neutral"],
  SANDBOX_FAILED: ["Sandbox failed", "bad"],
  DEPENDENCY_POLICY_VIOLATION: ["Dependency not allowed", "bad"],
  DEPENDENCY_INSTALL_FAILED: ["Install failed", "bad"],
  OPEN: ["Open", "active"], IN_REVIEW: ["In review", "active"], FUNDED: ["Funded", "neutral"],
  COMPLETED: ["Completed", "ok"], CANCELLED: ["Cancelled", "neutral"], REFUNDED: ["Refunded", "neutral"],
};
export function StatusBadge({ status }: { status: string }) {
  const [label, tone] = STATUS[status] ?? [status, "neutral" as Tone];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-muted">
      <div className="mb-1 opacity-60">{icon}</div>
      <p className="text-fg">{title}</p>
      {hint && <p className="max-w-xs text-xs">{hint}</p>}
    </div>
  );
}

export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-raised" />
      ))}
    </div>
  );
}

/**
 * Renders untrusted sandbox output as PLAIN TEXT (React escapes it; there is
 * no dangerouslySetInnerHTML anywhere in this app). Output is solver-
 * controlled data, not a trusted channel.
 */
export function LogViewer({ text }: { text: string }) {
  return (
    <pre className="selectable m-0 whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-fg/90">
      {text}
    </pre>
  );
}
