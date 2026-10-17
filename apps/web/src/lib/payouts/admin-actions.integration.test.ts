
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getTestDatabaseUrl, resetTestDatabase } from "@/test/db";

const url = getTestDatabaseUrl();

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ email: "admin@test.local" })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe.skipIf(!url)("admin payout actions integration", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let markPayoutFailed:
    typeof import("@/lib/payouts/admin-actions").markPayoutFailed;
  let markPayoutSucceeded:
    typeof import("@/lib/payouts/admin-actions").markPayoutSucceeded;
  let seq = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = url as string;
    await resetTestDatabase(url as string);

    prisma = (await import("@/lib/db")).prisma;
    ({ markPayoutFailed, markPayoutSucceeded } = await import(
      "@/lib/payouts/admin-actions"
    ));
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("refunds a failed payout exactly once under concurrent admin actions", async () => {
    const user = await prisma.user.create({
  data: {
    id: "payout-refund-test-user",
    email: "payout-refund-test@example.com",
    name: "Payout Refund Test",
    availableBalance: 0,
  },
});

    const payout = await prisma.payoutRequest.create({
      data: {
        userId: user.id,
        requestedAmount: 80,
        feeAmount: 0,
        payoutAmount: 80,
        legalName: "Test User",
        bankCountry: "IN",
        bankAccountNumber: "TEST-ACCOUNT-001",
        bankIfscOrSwift: "TEST0000001",
        status: "PENDING",
        eligibleAt: new Date(),
      },
    });

    const results = await Promise.allSettled([
      markPayoutFailed(payout.id),
      markPayoutFailed(payout.id),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    const [updatedPayout, updatedUser] = await Promise.all([
      prisma.payoutRequest.findUniqueOrThrow({
        where: { id: payout.id },
      }),
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      }),
    ]);

    expect(updatedPayout.status).toBe("FAILED");
    expect(updatedUser.availableBalance.toString()).toBe("80");
  });

  /**
   * THE required race from the audit spec (section C): markPayoutSucceeded
   * and markPayoutFailed fired concurrently against the SAME pending payout.
   * Exactly one terminal transition must win; a refund must happen exactly
   * once if-and-only-if FAILED wins; a payout that ends SUCCEEDED must never
   * be refunded by a competing failure action. This exact scenario was
   * previously untested — only FAILED-vs-FAILED was covered.
   *
   * Run many times with fresh rows each iteration to flate out any
   * non-determinism in which side of the race wins (both outcomes are legal;
   * what's being checked is that the invariant holds whichever one does).
   */
  it("exactly one terminal transition wins when succeeded and failed race on the same payout, and a refund happens iff FAILED wins", async () => {
    const ITERATIONS = 8;
    for (let i = 0; i < ITERATIONS; i++) {
      const id = ++seq;
      const user = await prisma.user.create({
        data: {
          id: `payout-race-user-${id}`,
          email: `payout-race-${id}@test.dev`,
          name: "Payout Race Test",
          availableBalance: 0,
        },
      });

      const payout = await prisma.payoutRequest.create({
        data: {
          userId: user.id,
          requestedAmount: 80,
          feeAmount: 4,
          payoutAmount: 76,
          legalName: "Test User",
          bankCountry: "IN",
          bankAccountNumber: `TEST-ACCOUNT-${id}`,
          bankIfscOrSwift: "TEST0000001",
          status: "PENDING",
          eligibleAt: new Date(),
        },
      });

      const results = await Promise.allSettled([
        markPayoutSucceeded(payout.id),
        markPayoutFailed(payout.id),
      ]);

      // Exactly one of the two admin actions wins the race; the other must
      // throw ("not pending" — see admin-actions.ts's conditional updateMany).
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const [updatedPayout, updatedUser] = await Promise.all([
        prisma.payoutRequest.findUniqueOrThrow({ where: { id: payout.id } }),
        prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      ]);

      // The DB state must be self-consistent with whichever one actually won:
      // index 0 is markPayoutSucceeded, index 1 is markPayoutFailed.
      const succeededWon = results[0].status === "fulfilled";
      const failedWon = results[1].status === "fulfilled";
      expect(succeededWon).toBe(!failedWon); // exactly one, never both, never neither

      if (succeededWon) {
        expect(updatedPayout.status).toBe("SUCCEEDED");
        // A succeeded payout must NEVER be refunded by the losing failure call.
        expect(Number(updatedUser.availableBalance)).toBe(0);
      } else {
        expect(updatedPayout.status).toBe("FAILED");
        // A failed payout must be refunded exactly once, for the full requested amount.
        expect(Number(updatedUser.availableBalance)).toBe(80);
      }

      // completedAt must be set by whichever transition actually won.
      expect(updatedPayout.completedAt).not.toBeNull();
    }
  });

  it("markPayoutSucceeded on an already-SUCCEEDED payout is rejected and does not double-process", async () => {
    const id = ++seq;
    const user = await prisma.user.create({
      data: {
        id: `payout-double-succeed-user-${id}`,
        email: `payout-double-succeed-${id}@test.dev`,
        name: "Double Succeed Test",
        availableBalance: 0,
      },
    });
    const payout = await prisma.payoutRequest.create({
      data: {
        userId: user.id,
        requestedAmount: 50,
        feeAmount: 0,
        payoutAmount: 50,
        legalName: "Test User",
        bankCountry: "IN",
        bankAccountNumber: `TEST-ACCOUNT-DS-${id}`,
        bankIfscOrSwift: "TEST0000001",
        status: "SUCCEEDED",
        completedAt: new Date(),
        eligibleAt: new Date(),
      },
    });

    await expect(markPayoutSucceeded(payout.id)).rejects.toThrow();

    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(Number(unchanged.availableBalance)).toBe(0);
    const unchangedPayout = await prisma.payoutRequest.findUniqueOrThrow({ where: { id: payout.id } });
    expect(unchangedPayout.status).toBe("SUCCEEDED");
  });

  it("markPayoutFailed on an already-FAILED payout is rejected and does not refund twice", async () => {
    const id = ++seq;
    const user = await prisma.user.create({
      data: {
        id: `payout-double-fail-user-${id}`,
        email: `payout-double-fail-${id}@test.dev`,
        name: "Double Fail Test",
        availableBalance: 80, // already refunded once by the first (hypothetical) failure
      },
    });
    const payout = await prisma.payoutRequest.create({
      data: {
        userId: user.id,
        requestedAmount: 80,
        feeAmount: 0,
        payoutAmount: 80,
        legalName: "Test User",
        bankCountry: "IN",
        bankAccountNumber: `TEST-ACCOUNT-DF-${id}`,
        bankIfscOrSwift: "TEST0000001",
        status: "FAILED",
        completedAt: new Date(),
        eligibleAt: new Date(),
      },
    });

    await expect(markPayoutFailed(payout.id)).rejects.toThrow();

    // Balance must be untouched by the rejected second call — no double refund.
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(Number(unchanged.availableBalance)).toBe(80);
  });

  it("rejects an unknown payout id for both transitions", async () => {
    await expect(markPayoutSucceeded("does-not-exist")).rejects.toThrow();
    await expect(markPayoutFailed("does-not-exist")).rejects.toThrow();
  });
});
