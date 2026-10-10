import { useState } from "react";
import { Lock } from "lucide-react";
import { useApp } from "../stores/app";
import { supabaseConfigured } from "../lib/supabase";

export function Login() {
  const { signIn, authError, connection } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await signIn(email.trim(), password);
    setBusy(false);
  };

  return (
    <div className="flex h-full items-center justify-center">
      <form onSubmit={submit} className="w-80 space-y-3 rounded-lg border border-line bg-panel p-5">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-accent" />
          <h1 className="text-sm font-semibold">Sign in to Bountied</h1>
        </div>
        {!supabaseConfigured && (
          <p className="rounded border border-warn/30 bg-warn/10 p-2 text-xs text-warn">
            VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. Copy .env.example to .env.
          </p>
        )}
        {connection === "expired" && !authError && <p className="text-xs text-warn">Session expired.</p>}
        <label className="block text-xs text-muted">Email
          <input className="selectable mt-1 w-full rounded border border-line bg-bg px-2 py-1.5 text-fg"
            type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-xs text-muted">Password
          <input className="selectable mt-1 w-full rounded border border-line bg-bg px-2 py-1.5 text-fg"
            type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {authError && <p role="alert" className="text-xs text-bad">{authError}</p>}
        <button disabled={busy || !supabaseConfigured}
          className="w-full rounded bg-accent py-1.5 font-medium text-bg transition-opacity disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-[11px] leading-4 text-muted">
          Email/password only for now. GitHub sign-in needs a deep-link callback (not built yet).
        </p>
      </form>
    </div>
  );
}
