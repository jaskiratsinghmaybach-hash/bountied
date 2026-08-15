"use client";

import { useActionState } from "react";
import { signUpWithEmail, type AuthActionResult } from "@/lib/auth/actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthActionResult, FormData>(
    (_prevState, formData) => signUpWithEmail(formData),
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
        <label htmlFor="name" className="block text-xs text-foreground-muted mb-1.5">
          Name
        </label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          className="w-full bg-surface border-border focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong focus-visible:outline-none transition-colors"
          placeholder="Your name"
        />
      </div>
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
      <div>
        <label htmlFor="password" className="block text-xs text-foreground-muted mb-1.5">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full bg-surface border-border focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:border-border-strong focus-visible:outline-none transition-colors"
          placeholder="At least 8 characters"
        />
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="mt-2 w-full"
      >
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
