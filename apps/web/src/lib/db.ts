import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires an explicit driver adapter — this is the runtime
// connection (pooled, via Supabase's pgbouncer endpoint). The CLI's own
// migrations use DIRECT_URL, configured separately in prisma.config.ts.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Prevents exhausting DB connections during Next.js dev hot-reload,
// which creates a new module scope on every file save.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
