
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

  beforeAll(async () => {
    process.env.DATABASE_URL = url as string;
    await resetTestDatabase(url as string);

    prisma = (await import("@/lib/db")).prisma;
    ({ markPayoutFailed } = await import("@/lib/payouts/admin-actions"));
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
});
