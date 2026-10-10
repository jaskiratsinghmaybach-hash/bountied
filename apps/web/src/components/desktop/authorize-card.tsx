"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Monitor, ShieldAlert, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authorizeDesktopAction, denyDesktopAction } from "@/lib/desktop/actions";

type Props = {
  pairingId: string;
  account: { name: string; email: string };
  device: { name: string; platform: string; appVersion: string };
  requestedAt: string;
  requestExpiresAt: string;
  differentNetwork: boolean;
};

const PLATFORM_LABEL: Record<string, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };

function useCountdown(iso: string | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!iso) return;
    const tick = () => setLeft(Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [iso]);
  return left;
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function AuthorizeCard({ pairingId, account, device, requestedAt, requestExpiresAt, differentNetwork }: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ code: string; expiresAt: string } | null>(null);
  const [denied, setDenied] = useState(false);
  const [copied, setCopied] = useState(false);

  const requestLeft = useCountdown(issued ? null : requestExpiresAt);
  const codeLeft = useCountdown(issued?.expiresAt ?? null);

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically. Select the code and copy it manually.");
    }
  }

  if (denied) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold tracking-tight mb-2">Connection cancelled</h1>
        <p className="text-sm text-foreground-muted">That request was cancelled and can no longer be used. You can close this tab.</p>
      </div>
    );
  }

  if (issued) {
    const expired = codeLeft === 0;
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold tracking-tight mb-1">Your pairing code</h1>
        <p className="text-sm text-foreground-muted mb-5">
          Copy this code and paste it into Bountied Desktop. It works once.
        </p>

        <div
          className={`rounded-md border border-border bg-background px-4 py-5 text-center font-mono text-2xl tracking-[0.18em] select-all ${expired ? "opacity-40 line-through" : ""}`}
          aria-label="Pairing code"
        >
          {issued.code}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-foreground-muted">
          <span>{expired ? "Expired. Start again from the app." : `Expires in ${codeLeft === null ? "…" : mmss(codeLeft)}`}</span>
          <Button type="button" size="sm" variant="outline" onClick={copy} disabled={expired}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy code"}
          </Button>
        </div>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <p className="mt-5 text-xs text-foreground-muted leading-5">
          Never share this code with anyone. Bountied staff will never ask for it. Only paste it into the
          Bountied Desktop app you opened yourself.
        </p>
      </div>
    );
  }

  const requestedLabel = new Date(requestedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-center gap-3 mb-5">
        <Monitor size={20} className="text-foreground-muted" />
        <h1 className="text-lg font-semibold tracking-tight">Connect Bountied Desktop</h1>
      </div>

      <dl className="space-y-3 text-sm mb-5">
        <div className="flex justify-between gap-4">
          <dt className="text-foreground-muted">Account</dt>
          <dd className="text-right"><span className="font-medium">{account.name}</span><br /><span className="text-xs text-foreground-muted">{account.email}</span></dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-foreground-muted">Device</dt>
          <dd className="text-right font-medium">{device.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-foreground-muted">System</dt>
          <dd className="text-right">{PLATFORM_LABEL[device.platform] ?? device.platform} · app v{device.appVersion}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-foreground-muted">Requested</dt>
          <dd className="text-right">{requestedLabel}{requestLeft !== null && ` · ${requestLeft === 0 ? "expired" : `${mmss(requestLeft)} left`}`}</dd>
        </div>
      </dl>

      {differentNetwork && (
        <div className="mb-4 flex gap-2 rounded-md border border-border bg-background p-3 text-xs text-foreground-muted">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span>This request came from a different network than this browser. Continue only if you started it yourself on another connection.</span>
        </div>
      )}

      <div className="mb-5 flex gap-2 rounded-md border border-border bg-background p-3 text-xs text-foreground-muted">
        <ShieldAlert size={14} className="mt-0.5 shrink-0" />
        <span>Only continue if you just clicked <strong className="text-foreground">Connect</strong> in Bountied Desktop on a computer you control. If someone sent you this link, cancel.</span>
      </div>

      {error && <p className="mb-3 text-xs text-destructive" role="alert">{error}</p>}

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={pending || requestLeft === 0}
          onClick={() => {
            setError(null);
            start(async () => {
              const r = await authorizeDesktopAction(pairingId);
              if (r.ok && r.code && r.codeExpiresAt) setIssued({ code: r.code, expiresAt: r.codeExpiresAt });
              else setError(r.error ?? "Something went wrong. Try again.");
            });
          }}
        >
          {pending ? "Authorizing…" : "Authorize this device"}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => start(async () => { await denyDesktopAction(pairingId); setDenied(true); })}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
