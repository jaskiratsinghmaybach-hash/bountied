"use client";

import { useActionState } from "react";
import { updatePassword, type AuthActionResult } from "@/lib/auth/actions";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthActionResult, FormData>(
    (_prevState, formData) => updatePassword(formData),
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error && (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="password" className="block text-xs text-foreground-muted mb-1.5">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
          placeholder="At least 8 characters"
        />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-xs text-foreground-muted mb-1.5">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          className="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent transition-colors"
          placeholder="Type it again"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-md bg-accent text-background font-medium px-4 py-2.5 text-sm hover:bg-accent-dim transition-colors disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
