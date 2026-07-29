"use client";

import { useActionState } from "react";
import { signInWithEmail, type AuthActionResult } from "@/lib/auth/actions";

export function LoginForm({ redirectedFrom }: { redirectedFrom: string }) {
  const [state, formAction, pending] = useActionState<AuthActionResult, FormData>(
    (_prevState, formData) => signInWithEmail(formData),
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="redirectedFrom" value={redirectedFrom} />

      {state?.error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="email" className="block text-xs text-foreground-muted mb-1.5">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
          placeholder="you@example.com"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs text-foreground-muted mb-1.5">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
          placeholder="••••••••"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-accent text-background font-medium px-4 py-2.5 text-sm hover:bg-accent-dim transition-colors disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
