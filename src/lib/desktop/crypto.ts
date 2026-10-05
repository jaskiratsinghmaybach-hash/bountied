import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { PAIRING } from "./config";

/**
 * All stored secrets (pairing codes, access tokens, refresh tokens) are
 * HMAC-SHA256 hashed with a server-side key, so a database leak alone is
 * not enough to redeem a code or impersonate a device.
 */
function key(): Buffer {
  const secret = process.env.DESKTOP_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    // Fail closed: never fall back to a default key.
    throw new Error("DESKTOP_AUTH_SECRET must be set to a random string of at least 32 characters.");
  }
  return Buffer.from(secret, "utf8");
}

export function hmac(purpose: "code" | "access" | "refresh", value: string): string {
  return createHmac("sha256", key()).update(`${purpose}:`).update(value).digest("base64url");
}

/** 256-bit opaque token, base64url (43 chars). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 128-bit identifier for a pairing request. */
export function newPairingId(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * Crockford-style base32 without I, L, O, U (no look-alikes). 32 symbols and
 * a 256-value byte space, so `byte & 31` is perfectly uniform (no modulo
 * bias). 16 symbols = 80 bits of entropy.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newPairingCode(): string {
  const bytes = randomBytes(PAIRING.codeLength);
  let out = "";
  for (let i = 0; i < PAIRING.codeLength; i++) out += ALPHABET[bytes[i] & 31];
  return out;
}

/** "abcd-efgh ..." -> "ABCDEFGH..." and the usual look-alike fixes; null if not a well-formed code. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (cleaned.length !== PAIRING.codeLength) return null;
  for (const ch of cleaned) if (!ALPHABET.includes(ch)) return null;
  return cleaned;
}

export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)!.join("-");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** RFC 7636 S256: base64url(SHA-256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

const B64URL = /^[A-Za-z0-9_-]+$/;
export function isPkceVerifier(v: unknown): v is string {
  return typeof v === "string" && v.length >= 43 && v.length <= 128 && B64URL.test(v);
}
export function isPkceChallenge(v: unknown): v is string {
  return typeof v === "string" && v.length === 43 && B64URL.test(v);
}
export function isPairingId(v: unknown): v is string {
  return typeof v === "string" && v.length === 22 && B64URL.test(v);
}
