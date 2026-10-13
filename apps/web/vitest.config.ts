import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => {
  // Lets you keep TEST_DATABASE_URL in a gitignored apps/web/.env.test instead of setting it in
  // every terminal. ONLY keys starting with TEST_ are read from .env files, so the real
  // DATABASE_URL in your .env can never reach the tests. A value already set in your terminal wins.
  const fromFile = loadEnv(mode, here, "TEST_");
  const env: Record<string, string> = {};
  if (!process.env.TEST_DATABASE_URL && fromFile.TEST_DATABASE_URL) {
    env.TEST_DATABASE_URL = fromFile.TEST_DATABASE_URL;
  }

  return {
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      env,
      // Integration tests share one database, so files run one after another.
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  };
});
