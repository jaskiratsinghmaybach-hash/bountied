"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { formatCode } from "./crypto";
import { clientIp } from "./ratelimit";
import { authorizePairing, denyPairing, revokeSession } from "./pairing";

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
  return profile?.id ?? null;
}

/** Flat shape so it narrows under this repo's `strict: false`. */
export type AuthorizeActionResult = { ok: boolean; code?: string; codeExpiresAt?: string; error?: string };

/** The user clicked "Authorize" on /desktop/connect. Returns the one-time code, shown once. */
export async function authorizeDesktopAction(pairingId: string): Promise<AuthorizeActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Please sign in again." };

  const r = await authorizePairing(String(pairingId), userId, clientIp(await headers()));
  if (r.kind === "rate_limited") return { ok: false, error: `Too many attempts. Try again in ${r.retryAfterSec}s.` };
  if (r.kind === "invalid") return { ok: false, error: "This request expired or was already used. Start again from Bountied Desktop." };
  return { ok: true, code: formatCode(r.code), codeExpiresAt: r.codeExpiresAt.toISOString() };
}

export async function denyDesktopAction(pairingId: string): Promise<void> {
  const userId = await currentUserId();
  if (userId) await denyPairing(String(pairingId), userId);
}

export async function revokeDesktopDeviceAction(sessionId: string): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false };
  const ok = await revokeSession(String(sessionId), userId, "revoked_from_website");
  revalidatePath("/integrations");
  return { ok };
}
