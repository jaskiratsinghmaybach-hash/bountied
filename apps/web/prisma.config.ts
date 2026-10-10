import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved connection config out of schema.prisma and into this file.
// The Prisma CLI (migrate, studio, etc.) uses DIRECT_URL so migrations run
// over a direct connection, not through Supabase's pooler.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
