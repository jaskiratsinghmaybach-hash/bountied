import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ExternalLink, KeyRound, Loader2, MonitorSmartphone, ShieldCheck, Timer, WifiOff } from "lucide-react";
import { useApp } from "../stores/app";
import { ipc, IpcError } from "../lib/ipc";

export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-[22%] bg-accent font-bold text-bg"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      aria-hidden="true"
    >
      B
    </div>
  );
}

/** "abcd1234..." -> "ABCD-1234-...", max 16 symbols. Display only; the server re-normalizes. */
function formatCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 16);
  return clean.match(/.{1,4}/g)?.join("-") ?? "";
}
const isComplete = (v: string) => v.replace(/-/g, "").length === 16;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type Step = "idle" | "starting" | "waiting" | "redeeming";

export function Pairing() {
  const { signedOutReason, connection, paired } = useApp();
  const [step, setStep] = useState<Step>("idle");
  const [deviceName, setDeviceName] = useState("");
  const [deadline, setDeadline] = useState(0);
  const [left, setLeft] = useState(0);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Countdown for the pairing request.
  useEffect(() => {
    if (step !== "waiting" && step !== "redeeming") return;
    const tick = () => setLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [step, deadline]);

  useEffect(() => { if (step === "waiting") inputRef.current?.focus(); }, [step]);

  const expired = (step === "waiting" || step === "redeeming") && left === 0 && deadline > 0;

  const begin = useCallback(async () => {
    setError(null); setCode(""); setStep("starting");
    try {
      const r = await ipc.beginPairing();
      setDeviceName(r.device_name);
      setDeadline(Date.now() + r.expires_in_sec * 1000);
      setStep("waiting");
    } catch (e) {
      setError(e instanceof IpcError ? e.message : "Something went wrong.");
      setStep("idle");
    }
  }, []);

  const redeem = useCallback(async (value: string) => {
    if (!isComplete(value)) return;
    setError(null); setStep("redeeming");
    try {
      const st = await ipc.completePairing(value);
      paired(st.user);
    } catch (e) {
      const err = e instanceof IpcError ? e : new IpcError("internal", "Something went wrong.");
      if (err.code === "pairing_expired") { setStep("idle"); setError(err.message); return; }
      setError(err.message); setCode(""); setStep("waiting");
    }
  }, [paired]);

  const cancel = async () => { await ipc.cancelPairing().catch(() => {}); setStep("idle"); setError(null); setCode(""); };

  return (
    <div className="grid h-full grid-cols-[340px_1fr]">
      <aside className="flex flex-col justify-between border-r border-line bg-panel p-8">
        <div>
          <BrandMark size={40} />
          <h1 className="mt-6 text-xl font-semibold leading-snug">Connect this device to your Bountied account</h1>
          <p className="mt-2 text-xs leading-5 text-muted">
            Bountied Desktop never asks for your password. You approve this computer on the Bountied website, and the website stays in control.
          </p>
        </div>
        <ul className="space-y-4 text-xs leading-5 text-muted">
          <li className="flex gap-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent" /><span><b className="text-fg">One-time code.</b> It works once and expires within minutes.</span></li>
          <li className="flex gap-3"><KeyRound size={16} className="mt-0.5 shrink-0 text-accent" /><span><b className="text-fg">Bound to this app.</b> A code sent to someone else's computer is useless.</span></li>
          <li className="flex gap-3"><MonitorSmartphone size={16} className="mt-0.5 shrink-0 text-accent" /><span><b className="text-fg">You're in control.</b> Revoke this device any time under Integrations on the website.</span></li>
        </ul>
      </aside>

      <main className="flex items-center justify-center p-10">
        <div className="w-full max-w-md">
          {signedOutReason === "session_ended" && step === "idle" && (
            <Banner tone="warn" icon={<AlertTriangle size={14} />}>This device was disconnected from your account. Pair it again to continue.</Banner>
          )}
          {connection === "offline" && step === "idle" && (
            <Banner tone="warn" icon={<WifiOff size={14} />}>Can't reach Bountied right now. Check your connection, then connect.</Banner>
          )}

          {(step === "idle" || step === "starting") && (
            <section>
              <h2 className="text-lg font-semibold">Connect Bountied Desktop</h2>
              <p className="mt-1 text-xs leading-5 text-muted">We'll open the Bountied website in your browser so you can approve this computer.</p>
              {error && <p role="alert" className="mt-4 text-xs text-bad">{error}</p>}
              <button onClick={begin} disabled={step === "starting"}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded bg-accent py-2.5 font-medium text-bg transition-opacity disabled:opacity-60">
                {step === "starting" ? <><Loader2 size={14} className="animate-spin" /> Opening browser…</> : <>Connect Bountied Desktop <ArrowRight size={14} /></>}
              </button>
            </section>
          )}

          {(step === "waiting" || step === "redeeming") && (
            <section>
              <ol className="mb-6 space-y-3 text-xs">
                <StepRow done n={1}>Browser opened for <span className="text-fg">{deviceName}</span></StepRow>
                <StepRow n={2} active>Sign in if asked, check the details, and choose <b className="text-fg">Authorize this device</b></StepRow>
                <StepRow n={3} active>Copy the code and paste it below</StepRow>
              </ol>

              <label htmlFor="code" className="mb-1.5 block text-xs text-muted">Pairing code</label>
              <input
                id="code" ref={inputRef} value={code} disabled={step === "redeeming" || expired}
                onChange={(e) => { const v = formatCode(e.target.value); setCode(v); setError(null); }}
                onPaste={(e) => {
                  const v = formatCode(e.clipboardData.getData("text"));
                  e.preventDefault(); setCode(v);
                  if (isComplete(v)) void redeem(v); // paste -> connect, no extra click
                }}
                onKeyDown={(e) => { if (e.key === "Enter") void redeem(code); }}
                placeholder="XXXX-XXXX-XXXX-XXXX" spellCheck={false} autoComplete="off" autoCapitalize="characters"
                className="selectable w-full rounded border border-line bg-bg px-3 py-3 text-center font-mono text-lg tracking-[0.2em] text-fg placeholder:text-muted/40 disabled:opacity-60"
              />

              <div aria-live="polite" className="mt-3 min-h-5 text-xs">
                {error && <p role="alert" className="text-bad">{error}</p>}
                {expired && <p className="text-warn">This request expired. Start again.</p>}
              </div>

              <button onClick={() => void redeem(code)} disabled={!isComplete(code) || step === "redeeming" || expired}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-accent py-2.5 font-medium text-bg transition-opacity disabled:opacity-40">
                {step === "redeeming" ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : <>Connect</>}
              </button>

              <div className="mt-4 flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1.5"><Timer size={12} />{expired ? "Expired" : `Request expires in ${mmss(left)}`}</span>
                <span className="flex items-center gap-3">
                  {!expired && <button onClick={() => void ipc.reopenPairing().catch((e) => setError(e instanceof IpcError ? e.message : "Couldn't open the browser."))}
                    className="flex items-center gap-1 hover:text-fg"><ExternalLink size={12} /> Reopen page</button>}
                  <button onClick={expired ? begin : cancel} className="hover:text-fg">{expired ? "Start again" : "Cancel"}</button>
                </span>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function Banner({ tone, icon, children }: { tone: "warn"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div role="status" className={`mb-5 flex items-start gap-2 rounded border p-3 text-xs ${tone === "warn" ? "border-warn/30 bg-warn/10 text-warn" : ""}`}>
      <span className="mt-0.5 shrink-0">{icon}</span><span>{children}</span>
    </div>
  );
}

function StepRow({ n, done, active, children }: { n: number; done?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${done ? "border-ok/40 bg-ok/15 text-ok" : active ? "border-accent/50 text-accent" : "border-line text-muted"}`}>
        {done ? <Check size={11} /> : n}
      </span>
      <span className="leading-5 text-muted">{children}</span>
    </li>
  );
}
