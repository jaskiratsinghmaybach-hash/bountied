import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function encryptionKey(): Buffer {
  const configured = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be configured before storing or reading encrypted GitHub tokens.");
  }

  const key = Buffer.from(configured, "base64");
  if (key.length !== 32 || key.toString("base64").replace(/=+$/, "") !== configured.replace(/=+$/, "")) {
    throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

/** Encrypt a newly received GitHub OAuth token before it is written to the database. */
export function encryptGithubToken(token: string): string {
  if (token.startsWith(PREFIX)) {
    // Validate existing ciphertext rather than accidentally encrypting it twice.
    decryptGithubToken(token);
    return token;
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

/**
 * Decrypt stored GitHub tokens. Plaintext is accepted only as a migration
 * compatibility path; new writes must always go through encryptGithubToken.
 * Invalid ciphertext fails closed and is never returned as a bearer token.
 */
export function decryptGithubToken(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;

  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("Stored GitHub token has an invalid enc:v1 format.");
  }

  try {
    const iv = Buffer.from(parts[0], "base64url");
    const tag = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) {
      throw new Error("Invalid ciphertext dimensions.");
    }
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message.includes("GITHUB_TOKEN_ENCRYPTION_KEY")) throw error;
    throw new Error("Could not decrypt the stored GitHub token. Check GITHUB_TOKEN_ENCRYPTION_KEY and the stored value.");
  }
}

export function decryptGithubTokenOrNull(stored: string | null | undefined): string | null {
  return stored ? decryptGithubToken(stored) : null;
}

export function isEncryptedGithubToken(stored: string | null | undefined): boolean {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}
