import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * Integration tests run against a SEPARATE database named in TEST_DATABASE_URL.
 * They wipe and rebuild the public schema, so this refuses to run unless the
 * database name contains "test" and the URL is not your DATABASE_URL. It never
 * reads DATABASE_URL on its own: your live Supabase database cannot be reached
 * by accident.
 */
export function getTestDatabaseUrl(): string | null {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return null;
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(dbName)) {
    throw new Error(`TEST_DATABASE_URL must point at a database whose name contains "test" (got "${dbName}").`);
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
    throw new Error("TEST_DATABASE_URL must not be the same as DATABASE_URL.");
  }
  return url;
}

/** Drops everything in the test database and re-applies every migration in order. */
export async function resetTestDatabase(url: string): Promise<void> {
  const migrationsDir = path.resolve(__dirname, "../../prisma/migrations");
  const names = readdirSync(migrationsDir)
    .filter((n) => statSync(path.join(migrationsDir, n)).isDirectory())
    .sort();

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    for (const name of names) {
      await client.query(readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8"));
    }
  } finally {
    await client.end();
  }
}
