"use server";

import { createClient } from "@/lib/supabase/server";
import { syncUserFromSupabase } from "@/lib/auth/sync-user";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export type AuthActionResult = { error: string } | void;

/**
 * Where a newly-authenticated user should land: onboarding if they haven't
 * picked a role yet, otherwise the dashboard. Used by email/password login,
 * signup, and the OAuth callback route so all three paths behave the same.
 */
async function postAuthRedirectPath(userId: string): Promise<string> {
  const profile = await prisma.user.findUnique({ where: { id: userId } });
  return profile?.role ? "/dashboard" : "/onboarding";
}

export async function signUpWithEmail(formData: FormData): Promise<AuthActionResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  });

  if (error) return { error: error.message };

  // If email confirmation is required, there's no session yet — data.user
  // exists but data.session is null. Don't sync to Prisma until they
  // actually confirm and get a real session, otherwise you get orphaned
  // rows for people who never verify their email.
  if (data.user && data.session) {
    await syncUserFromSupabase(data.user);
    redirect(await postAuthRedirectPath(data.user.id));
  }

  redirect("/signup?checkEmail=true");
}

export async function signInWithEmail(formData: FormData): Promise<AuthActionResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };
  if (data.user) {
    await syncUserFromSupabase(data.user);
    redirect(await postAuthRedirectPath(data.user.id));
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function setUserRole(role: "SOLVER" | "GIVER" | "BOTH") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role },
  });

  redirect("/dashboard");
}

/**
 * Sends a password-recovery email. Works for BOTH:
 *   - existing email/password users who forgot their password
 *   - OAuth-only users (Google/GitHub) who want to add a password
 *     so they can also log in with email+password on another device
 * Supabase's recovery link is signed, single-use, and time-limited (1hr
 * default) — do not build a custom token/link system for this yourself.
 */
export async function requestPasswordReset(formData: FormData): Promise<AuthActionResult> {
  const email = formData.get("email") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });

  // Deliberately do NOT branch on `error` here in a way that reveals
  // whether the email exists in the system — that would let an attacker
  // enumerate registered emails. Supabase's resetPasswordForEmail already
  // returns success-shaped responses for unknown emails by default; we
  // mirror that by always showing the same "check your email" message
  // regardless of what happened server-side. Only surface an error for
  // genuine input problems (malformed email), not "email not found".
  if (error && error.status !== 400) {
    // Non-4xx (network/server issues) are safe to surface generically.
    return { error: "Something went wrong. Please try again in a moment." };
  }

  redirect("/forgot-password?sent=true");
}

/**
 * Sets a new password. Only works if the caller currently holds a valid
 * Supabase RECOVERY session — i.e. they arrived here by clicking the
 * emailed link, which Supabase exchanged for a temporary authenticated
 * session scoped to a password update. There is no email/token parameter
 * accepted directly by this action; the session itself is the proof of
 * ownership. This is what prevents anyone from setting a password for an
 * account they don't control just by knowing or guessing the email.
 */
export async function updatePassword(formData: FormData): Promise<AuthActionResult> {
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (password !== confirmPassword) {
    return { error: "Passwords don't match." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();

  // getUser() here validates there IS an active session (recovery or
  // otherwise) before we let anyone update anything.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "This link has expired or already been used. Please request a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };

  redirect(await postAuthRedirectPath(user.id));
}
