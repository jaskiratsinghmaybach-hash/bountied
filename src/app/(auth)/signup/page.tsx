import Link from "next/link";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { SignupForm } from "@/components/auth/signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ checkEmail?: string }>;
}) {
  const params = await searchParams;

  if (params.checkEmail) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight mb-3">Check your email</h1>
          <p className="text-sm text-foreground-muted leading-relaxed">
            We sent you a confirmation link. Click it to activate your account,
            then come back and log in.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-accent hover:underline text-sm"
          >
            Back to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Create your account</h1>
        <p className="text-sm text-foreground-muted mb-8">
          Post a bounty or start solving. Free to join.
        </p>

        <OAuthButtons />

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-foreground-muted uppercase tracking-wide">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <SignupForm />

        <p className="mt-6 text-sm text-foreground-muted text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
