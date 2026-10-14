import { afterEach, describe, expect, it } from "vitest";
import { decryptGithubToken, decryptGithubTokenOrNull, encryptGithubToken, isEncryptedGithubToken } from "./github-token";

const previousKey = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
const KEY = Buffer.from("bountied-test-key-32-bytes-long!!").subarray(0, 32).toString("base64");

afterEach(() => {
  if (previousKey === undefined) delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
  else process.env.GITHUB_TOKEN_ENCRYPTION_KEY = previousKey;
});

describe("GitHub token encryption", () => {
  it("encrypts with AES-GCM and decrypts to the original token", () => {
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = KEY;
    const token = "gho_example_secret_token";
    const encrypted = encryptGithubToken(token);
    expect(encrypted).not.toContain(token);
    expect(isEncryptedGithubToken(encrypted)).toBe(true);
    expect(decryptGithubToken(encrypted)).toBe(token);
  });

  it("uses a fresh IV for each encryption", () => {
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = KEY;
    expect(encryptGithubToken("same-token")).not.toBe(encryptGithubToken("same-token"));
  });

  it("supports legacy plaintext reads during migration", () => {
    expect(decryptGithubToken("legacy-token")).toBe("legacy-token");
    expect(decryptGithubTokenOrNull(null)).toBeNull();
    expect(decryptGithubTokenOrNull(undefined)).toBeNull();
  });

  it("fails closed when the key is missing for encrypted data", () => {
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = KEY;
    const encrypted = encryptGithubToken("gho_secret");
    delete process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
    expect(() => decryptGithubToken(encrypted)).toThrow(/GITHUB_TOKEN_ENCRYPTION_KEY/);
  });

  it("rejects tampered ciphertext", () => {
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = KEY;
    const encrypted = encryptGithubToken("gho_secret");
    const prefix = "enc:v1:";
    const [iv, tag, encodedCiphertext] = encrypted.slice(prefix.length).split(":");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    ciphertext[0] ^= 0x01;
    const tampered = `${prefix}${iv}:${tag}:${ciphertext.toString("base64url")}`;
    expect(() => decryptGithubToken(tampered)).toThrow(/Could not decrypt/);
  });

  it("does not double-encrypt an already encrypted value", () => {
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY = KEY;
    const encrypted = encryptGithubToken("gho_secret");
    expect(encryptGithubToken(encrypted)).toBe(encrypted);
  });
});
