
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl, resetTestDatabase } from "@/test/db";

const url = getTestDatabaseUrl();

describe.skipIf(!url)("withdrawals (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let requestWithdrawal: typeof import("./withdraw").requestWithdrawal;
  let seq = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = url as string;
    await resetTestDatabase(url as string);
    prisma = (await import("@/lib/db")).prisma;
    ({ requestWithdrawal } = await import("./withdraw"));
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("does not allow concurrent withdrawals to overspend the balance", async () => {
    const id = ++seq;

    const user = await prisma.user.create({
      data: {
        id: `withdraw-race-${id}`,
        email: `withdraw-race-${id}@test.dev`,
        name: "Withdrawal test",
        availableBalance: 100,
        bankDetailsAdded: true,
        legalName: "Test User",
        bankCountry: "IN",
        bankAccountNumber: "TEST-ACCOUNT",
        bankIfscOrSwift: "TEST0001234",
      },
    });

    const results = await Promise.all([
      requestWithdrawal({ userId: user.id, requestedAmount: 80 }),
      requestWithdrawal({ userId: user.id, requestedAmount: 80 }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    expect(Number(updatedUser.availableBalance)).toBe(20);

    const requests = await prisma.payoutRequest.findMany({
      where: { userId: user.id },
    });

    expect(requests).toHaveLength(1);
    expect(Number(requests[0].requestedAmount)).toBe(80);
    expect(requests[0].status).toBe("PENDING");
  });

  it("rejects amounts with more than two decimal places", async () => {
    const id = ++seq;

    const user = await prisma.user.create({
      data: {
        id: `withdraw-invalid-${id}`,
        email: `withdraw-invalid-${id}@test.dev`,
        name: "Withdrawal test",
        availableBalance: 100,
        bankDetailsAdded: true,
        legalName: "Test User",
        bankCountry: "IN",
        bankAccountNumber: "TEST-ACCOUNT",
        bankIfscOrSwift: "TEST0001234",
      },
    });

    const result = await requestWithdrawal({
      userId: user.id,
      requestedAmount: 10.123,
    });

    expect(result.ok).toBe(false);
    expect(await prisma.payoutRequest.count({ where: { userId: user.id } })).toBe(0);
    expect(Number((await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    })).availableBalance)).toBe(100);
  });
});
