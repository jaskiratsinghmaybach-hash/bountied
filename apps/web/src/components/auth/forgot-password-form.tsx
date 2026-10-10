"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthActionResult } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthActionResult, FormData>(
    (_prevState, formData) => requestPasswordReset(formData),
    undefined
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error && (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">{state.error}</AlertDescription>
        </Alert>
      )}

      <div>
        <label htmlFor="email" className="block text-xs text-foreground-muted mb-1.5">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          className="w-full bg-surface border-border focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong focus-visible:outline-none transition-colors"
          placeholder="you@example.com"
        />
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="mt-2 w-full"
      >
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
