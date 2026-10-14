import "dotenv/config";
import { createCipheriv, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const PREFIX = "enc:v1:";
const keyText = process.env.GITHUB_TOKEN_ENCRYPTION_KEY;
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!keyText) throw new Error("Set GITHUB_TOKEN_ENCRYPTION_KEY before running this script.");
if (!connectionString) throw new Error("Set DIRECT_URL (preferred) or DATABASE_URL before running this script.");
const key = Buffer.from(keyText, "base64");
if (key.length !== 32) throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY must be base64-encoded 32-byte key material.");
const apply = process.argv.includes("--apply");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function encrypt(token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

try {
  const users = await prisma.user.findMany({
    where: { githubAccessToken: { not: null } },
    select: { id: true, githubAccessToken: true },
  });
  const pending = users.filter((user) => user.githubAccessToken && !user.githubAccessToken.startsWith(PREFIX));
  console.log(`GitHub token rows: ${users.length}; plaintext rows to encrypt: ${pending.length}; mode: ${apply ? "APPLY" : "DRY RUN"}`);
  if (!apply) {
    console.log("No rows changed. Re-run with --apply after verifying DATABASE_URL/DIRECT_URL and backing up the database.");
  } else {
    let updated = 0;
    for (const user of pending) {
      const oldValue = user.githubAccessToken;
      if (!oldValue) continue;
      const result = await prisma.user.updateMany({
        where: { id: user.id, githubAccessToken: oldValue },
        data: { githubAccessToken: encrypt(oldValue) },
      });
      updated += result.count;
    }
    console.log(`Encrypted ${updated} row(s). No token values were printed.`);
    if (updated !== pending.length) {
      console.error("Some rows changed concurrently or were not updated. Re-run in dry-run mode to inspect remaining plaintext rows.");
      process.exitCode = 2;
    }
  }
} finally {
  await prisma.$disconnect();
}
