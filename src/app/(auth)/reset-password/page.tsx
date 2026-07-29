import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session at all means this page was reached directly, not via a
  // valid recovery link. Don't show a password form with nothing behind it.
  if (!user) {
    redirect("/forgot-password");
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Set a new password</h1>
        <p className="text-sm text-foreground-muted mb-8">
          You&apos;ll be able to log in with {user.email} and this password,
          in addition to any other way you normally sign in.
        </p>

        <ResetPasswordForm />
      </div>
    </main>
  );
}
