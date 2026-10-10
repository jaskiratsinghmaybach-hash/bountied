"use client";

import { useState, useTransition } from "react";
import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revokeDesktopDeviceAction } from "@/lib/desktop/actions";

export type DeviceRow = {
  id: string; deviceName: string; platform: string; appVersion: string;
  createdAt: string; lastSeenAt: string; lastIp: string | null;
};

const PLATFORM_LABEL: Record<string, string> = { windows: "Windows", macos: "macOS", linux: "Linux" };

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function DesktopDevicesCard({ devices }: { devices: DeviceRow[] }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start gap-4">
        <Monitor size={20} className="text-foreground shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground mb-1">Bountied Desktop</p>
          <p className="text-xs text-foreground-muted">
            Computers connected to your account. Revoking a device signs it out immediately; it has to
            pair again to get back in. To connect a new one, open Bountied Desktop and choose Connect.
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-destructive" role="alert">{error}</p>}

      {devices.length === 0 ? (
        <p className="mt-4 text-xs text-foreground-muted">No desktop devices connected.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-t border-border">
          {devices.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{d.deviceName}</p>
                <p className="text-xs text-foreground-muted">
                  {PLATFORM_LABEL[d.platform] ?? d.platform} · v{d.appVersion} · connected {new Date(d.createdAt).toLocaleDateString()} · active {ago(d.lastSeenAt)}
                  {d.lastIp ? ` · ${d.lastIp}` : ""}
                </p>
              </div>
              {confirming === d.id ? (
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="destructive" disabled={pending}
                    onClick={() => start(async () => {
                      const r = await revokeDesktopDeviceAction(d.id);
                      if (!r.ok) setError("Couldn't revoke that device. Refresh and try again.");
                      setConfirming(null);
                    })}>
                    {pending ? "Revoking…" : "Confirm revoke"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>Keep</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setConfirming(d.id)}>Revoke</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
