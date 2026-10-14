/**
 * Runs the whole test suite, INCLUDING the database tests, against a brand-new
 * throwaway Postgres that this script starts and deletes. Nothing to install and
 * nothing to configure:
 *
 *   npm run test:db --workspace apps/web
 *   npm run test:db --workspace apps/web -- src/lib/payments     (only some tests)
 *
 * What it does:
 *   1. starts a private Postgres on a free local port, with a random password, in a
 *      temporary folder (embedded-postgres runs the real Postgres, no Docker needed);
 *   2. creates an empty database called bountied_test in it;
 *   3. runs vitest with TEST_DATABASE_URL pointing at that database ONLY;
 *   4. stops Postgres and deletes the folder, whatever the result.
 *
 * It can never touch your real database: the child process is started WITHOUT
 * DATABASE_URL or DIRECT_URL, and TEST_DATABASE_URL is always overwritten here.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, "..");
const require = createRequire(import.meta.url);

const DB_NAME = "bountied_test";
const USER = "bountied";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), "bountied-test-db-"));
  // Only matters when this runs as root (some CI containers): Postgres then runs as another user.
  if (typeof process.getuid === "function" && process.getuid() === 0) await chmod(root, 0o777);

  const port = await freePort();
  const password = randomBytes(16).toString("hex");
  const logs = [];
  const quiet = process.env.TEST_DB_VERBOSE ? console.log : (line) => logs.push(String(line));

  const pg = new EmbeddedPostgres({
    databaseDir: path.join(root, "data"),
    user: USER,
    password,
    port,
    persistent: false,
    onLog: quiet,
    onError: quiet,
  });

  let child = null;
  let cleaning = false;
  const cleanup = async () => {
    if (cleaning) return;
    cleaning = true;
    if (child && child.exitCode === null) child.kill();
    try {
      await pg.stop();
    } catch {
      // already stopped
    }
    await rm(root, { recursive: true, force: true }).catch(() => {});
  };
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      cleanup().finally(() => process.exit(130));
    });
  }

  try {
    console.log("Starting a temporary test database…");
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(DB_NAME);
  } catch (error) {
    console.error("Could not start the temporary test database.");
    console.error(String(error?.message ?? error));
    if (logs.length) console.error(logs.slice(-15).join("\n"));
    console.error("Run again with TEST_DB_VERBOSE=1 to see everything Postgres says.");
    await cleanup();
    return 1;
  }

  const url = `postgresql://${USER}:${password}@127.0.0.1:${port}/${DB_NAME}`;
  console.log(`Test database ready on port ${port}. Running tests…\n`);

  const env = { ...process.env, TEST_DATABASE_URL: url };
  delete env.DATABASE_URL;
  delete env.DIRECT_URL;

  const vitestBin = path.join(path.dirname(require.resolve("vitest/package.json")), "vitest.mjs");
  const args = process.argv.slice(2);
  const code = await new Promise((resolve) => {
    child = spawn(process.execPath, [vitestBin, "run", ...args], { cwd: webDir, env, stdio: "inherit" });
    child.on("exit", (c) => resolve(c ?? 1));
    child.on("error", () => resolve(1));
  });

  await cleanup();
  console.log("\nTemporary test database removed.");
  return code;
}

main().then((code) => process.exit(code));
