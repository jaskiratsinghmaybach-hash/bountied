import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const params = await searchParams;

  if (params.sent) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight mb-3">Check your email</h1>
          <p className="text-sm text-foreground-muted leading-relaxed">
            If an account exists for that email, we&apos;ve sent a link to set
            your password. It expires in 1 hour and can only be used once.
          </p>
          <p className="text-sm text-foreground-muted leading-relaxed mt-3">
            Signed up with Google or GitHub? This also works to add a
            password so you can log in with email on any device.
          </p>
          <Link href="/login" className="mt-6 inline-block text-accent hover:underline text-sm">
            Back to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Set or reset your password</h1>
        <p className="text-sm text-foreground-muted mb-8">
          Enter your account email. We&apos;ll send a secure link — works
          whether you signed up with a password, Google, or GitHub.
        </p>

        <ForgotPasswordForm />

        <p className="mt-6 text-sm text-foreground-muted text-center">
          <Link href="/login" className="text-accent hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
