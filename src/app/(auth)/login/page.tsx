import Link from "next/link";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectedFrom?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Log in</h1>
        <p className="text-sm text-foreground-muted mb-8">
          Welcome back. Pick up where you left off.
        </p>

        {params.error && (
          <p className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            Something went wrong signing you in. Please try again.
          </p>
        )}

        <OAuthButtons />

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-foreground-muted uppercase tracking-wide">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <LoginForm redirectedFrom={params.redirectedFrom ?? ""} />

        <p className="mt-3 text-sm text-center">
          <Link href="/forgot-password" className="text-foreground-muted hover:text-accent transition-colors">
            Forgot password, or want to set one?
          </Link>
        </p>

        <p className="mt-6 text-sm text-foreground-muted text-center">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
