import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl, resetTestDatabase } from "@/test/db";

/**
 * Real-Postgres tests for the wallet: top-ups through the Whop webhook handler
 * (for Givers and Solvers), exactly-once crediting under retries and
 * concurrency, and bounty funding. Run only when TEST_DATABASE_URL points at a
 * throwaway database (see src/test/db.ts).
 */
const url = getTestDatabaseUrl();

describe.skipIf(!url)("wallet credits (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let credits: typeof import("./credits");
  let events: typeof import("./whop-events");

  beforeAll(async () => {
    process.env.DATABASE_URL = url as string;
    await resetTestDatabase(url as string);
    prisma = (await import("@/lib/db")).prisma;
    credits = await import("./credits");
    events = await import("./whop-events");
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  let seq = 0;
  async function mkUser(credit = "0") {
    seq += 1;
    return prisma.user.create({
      data: { id: `u${seq}`, email: `u${seq}@test.dev`, name: `U ${seq}`, creditBalance: credit },
    });
  }
  const balance = async (id: string) => Number((await prisma.user.findUniqueOrThrow({ where: { id } })).creditBalance);
  const ledger = (userId: string) => prisma.creditTransaction.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const purchase = (userId: string, amount: number, ref: string) =>
    credits.creditUserBalance({ userId, amount, type: "PURCHASE", whopChargeRef: ref });
  const payment = (id: string | undefined, metadata: Record<string, unknown>, actual?: { amount?: number; currency?: string }) =>
    events.handleWhopEvent({
      type: "payment.succeeded",
      data: { id, metadata, total: { amount: actual?.amount ?? Number(metadata.requiredAmount), currency: actual?.currency ?? "USD" } },
    });

  describe("creditUserBalance", () => {
    it("credits a purchase and writes a ledger row with the balance after", async () => {
      const u = await mkUser("2.50");
      const r = await purchase(u.id, 10, "pay_a1");
      expect(r).toEqual({ credited: true, balance: 12.5 });
      const rows = await ledger(u.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe("PURCHASE");
      expect(Number(rows[0].amount)).toBe(10);
      expect(Number(rows[0].balanceAfter)).toBe(12.5);
      expect(rows[0].whopChargeRef).toBe("pay_a1");
    });

    it("credits a repeated delivery of the same payment only once", async () => {
      const u = await mkUser();
      expect((await purchase(u.id, 25, "pay_dup")).credited).toBe(true);
      const second = await purchase(u.id, 25, "pay_dup");
      expect(second).toEqual({ credited: false, balance: 25 });
      expect(await balance(u.id)).toBe(25);
      expect(await ledger(u.id)).toHaveLength(1);
    });

    it("credits once even when the same payment arrives many times at the same moment", async () => {
      const u = await mkUser();
      const results = await Promise.all(Array.from({ length: 8 }, () => purchase(u.id, 40, "pay_race")));
      expect(results.filter((r) => r.credited)).toHaveLength(1);
      expect(await balance(u.id)).toBe(40);
      expect(await ledger(u.id)).toHaveLength(1);
    });

    it("credits different payments separately", async () => {
      const u = await mkUser();
      await purchase(u.id, 5, "pay_x");
      await purchase(u.id, 7, "pay_y");
      expect(await balance(u.id)).toBe(12);
    });

    it("loses nothing when many credits land at once", async () => {
      const u = await mkUser();
      await Promise.all(Array.from({ length: 25 }, (_, i) => purchase(u.id, 1, `pay_many_${i}`)));
      expect(await balance(u.id)).toBe(25);
      const after = (await ledger(u.id)).map((r) => Number(r.balanceAfter)).sort((a, b) => a - b);
      expect(after).toEqual(Array.from({ length: 25 }, (_, i) => i + 1)); // every step recorded, none skipped
    });

    it("is not undone by a sandbox charge committing at the same moment", async () => {
      const giver = await mkUser();
      const solver = await mkUser("1.00");
      const problem = await prisma.problem.create({
        data: { id: `pb${++seq}`, title: "t", description: "d", tags: [], type: "OPEN_BOUNTY", status: "OPEN", giverId: giver.id },
      });
      const svc = await import("@/lib/solver-tests/service");
      // 6 bounties used up already so the next test is paid, then credit and charge together.
      await prisma.solverTestRun.createMany({
        data: Array.from({ length: 6 }, (_, i) => ({
          id: `old${seq}_${i}`, solverId: solver.id, problemId: `old_p_${seq}_${i}`, repoUrl: "https://github.com/a/b",
          commitSha: "a".repeat(40), status: "PASSED" as const, isFree: false, mode: "entry",
        })),
      }).catch(() => undefined);
      const [credit, begun] = await Promise.all([
        purchase(solver.id, 10, "pay_concurrent"),
        svc.beginSolverTest({ solverId: solver.id, problemId: problem.id, repoUrl: "https://github.com/a/b", commitSha: "b".repeat(40) }),
      ]);
      expect(credit.credited).toBe(true);
      const spent = begun.ok ? Number(begun.chargedFromCredit ?? 0) : 0;
      expect(await balance(solver.id)).toBeCloseTo(1 + 10 - spent, 2);
    });

    it("refuses an unknown user, and non-positive or non-finite amounts", async () => {
      await expect(purchase("nobody", 5, "pay_nu")).rejects.toThrow(/not found/);
      const u = await mkUser();
      for (const amount of [0, -3, NaN, Infinity]) {
        await expect(purchase(u.id, amount, `pay_bad_${amount}`)).rejects.toThrow(/non-positive/);
      }
      expect(await balance(u.id)).toBe(0);
    });
  });

  describe("handleWhopEvent", () => {
    it("tops up a Solver's wallet from a payment.succeeded event", async () => {
      const solver = await mkUser();
      const r = await payment("pay_s1", { userId: solver.id, requiredAmount: "20" });
      expect(r).toEqual({ status: 200, body: { received: true, credited: true } });
      expect(await balance(solver.id)).toBe(20);
    });

    it("still credits an older in-flight checkout that carries giverId", async () => {
      const u = await mkUser();
      await payment("pay_legacy", { giverId: u.id, requiredAmount: "15" });
      expect(await balance(u.id)).toBe(15);
    });

    it("credits a retried delivery once, and says so", async () => {
      const u = await mkUser();
      await payment("pay_retry", { userId: u.id, requiredAmount: "30" });
      const again = await payment("pay_retry", { userId: u.id, requiredAmount: "30" });
      expect(again.status).toBe(200);
      expect(again.body.credited).toBe(false);
      expect(await balance(u.id)).toBe(30);
    });

    it("rejects an event with no user, no amount, or no payment id, and credits nothing", async () => {
      const u = await mkUser();
      expect((await payment("p1", { requiredAmount: "10" })).status).toBe(400);
      expect((await payment("p2", { userId: u.id })).status).toBe(400);
      expect((await payment(undefined, { userId: u.id, requiredAmount: "10" })).status).toBe(400);
      expect(await balance(u.id)).toBe(0);
    });

    it("rejects a missing, mismatched, or non-USD provider charge", async () => {
      const u = await mkUser();
      const handler = events.handleWhopEvent;
      expect((await handler({ type: "payment.succeeded", data: { id: "pay_missing", metadata: { userId: u.id, requiredAmount: "10" }, currency: "USD" } })).status).toBe(400);
      expect((await payment("pay_mismatch", { userId: u.id, requiredAmount: "10" }, { amount: 9.99, currency: "USD" })).status).toBe(400);
      expect((await payment("pay_currency", { userId: u.id, requiredAmount: "10" }, { amount: 10, currency: "INR" })).status).toBe(400);
      expect(await balance(u.id)).toBe(0);
    });

    it("rejects an invalid credit amount and credits nothing", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {}); // the handler logs each rejected amount on purpose
      const u = await mkUser();
      for (const bad of ["abc", "0", "-5", "0.5", "10.005", "99999999999"]) {
        expect((await payment(`pay_inv_${bad}`, { userId: u.id, requiredAmount: bad })).status, bad).toBe(400);
      }
      expect(await balance(u.id)).toBe(0);
    });

    it("ignores events that aren't payments", async () => {
      const r = await events.handleWhopEvent({ type: "membership.went_valid", data: { id: "x", metadata: {} } });
      expect(r).toEqual({ status: 200, body: { received: true } });
    });

    it("funds a draft bounty from the top-up, and a retry neither re-credits nor re-funds it", async () => {
      const giver = await mkUser();
      const problem = await prisma.problem.create({
        data: { id: `pd${++seq}`, title: "t", description: "d", tags: [], type: "OPEN_BOUNTY", status: "DRAFT", giverId: giver.id, bountyAmount: "50" },
      });
      const meta = { userId: giver.id, draftProblemId: problem.id, requiredAmount: "55" };

      await payment("pay_fund", meta);
      expect((await prisma.problem.findUniqueOrThrow({ where: { id: problem.id } })).status).toBe("OPEN");
      expect(Number((await prisma.escrow.findUniqueOrThrow({ where: { problemId: problem.id } })).amount)).toBe(50);
      expect(await balance(giver.id)).toBe(0); // 55 in, 55 out (50 + the 10% fee)

      await payment("pay_fund", meta);
      expect(await balance(giver.id)).toBe(0);
      expect(await prisma.creditTransaction.count({ where: { userId: giver.id, type: "BOUNTY_FUNDING" } })).toBe(1);
    });

    it("does not let a Solver fund someone else's draft bounty", async () => {
      const giver = await mkUser();
      const solver = await mkUser();
      const problem = await prisma.problem.create({
        data: { id: `pd${++seq}`, title: "t", description: "d", tags: [], type: "OPEN_BOUNTY", status: "DRAFT", giverId: giver.id, bountyAmount: "10" },
      });
      await payment("pay_steal", { userId: solver.id, draftProblemId: problem.id, requiredAmount: "50" });
      expect((await prisma.problem.findUniqueOrThrow({ where: { id: problem.id } })).status).toBe("DRAFT");
      expect(await balance(solver.id)).toBe(50); // the money is theirs; nothing was funded
    });
  });

  describe("fundProblemFromCredits", () => {
    async function draft(giverId: string, bounty: string) {
      return prisma.problem.create({
        data: { id: `pf${++seq}`, title: "t", description: "d", tags: [], type: "OPEN_BOUNTY", status: "DRAFT", giverId, bountyAmount: bounty },
      });
    }

    it("reports what is missing when the balance is short, and moves nothing", async () => {
      const giver = await mkUser("10");
      const p = await draft(giver.id, "50");
      const r = await credits.fundProblemFromCredits({ problemId: p.id, giverId: giver.id });
      expect(r).toMatchObject({ ok: false, reason: "INSUFFICIENT_FUNDS", required: 55, balance: 10 });
      expect(await balance(giver.id)).toBe(10);
      expect((await prisma.problem.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("DRAFT");
    });

    it("debits exactly bounty + 10% and records it", async () => {
      const giver = await mkUser("100");
      const p = await draft(giver.id, "50");
      expect((await credits.fundProblemFromCredits({ problemId: p.id, giverId: giver.id })).ok).toBe(true);
      expect(await balance(giver.id)).toBe(45);
      const rows = await ledger(giver.id);
      expect(rows.at(-1)?.type).toBe("BOUNTY_FUNDING");
      expect(Number(rows.at(-1)?.amount)).toBe(-55);
      expect(Number(rows.at(-1)?.balanceAfter)).toBe(45);
    });

    it("does not lose a top-up that lands at the same moment", async () => {
      const giver = await mkUser("55");
      const p = await draft(giver.id, "50");
      const [fund, credit] = await Promise.all([
        credits.fundProblemFromCredits({ problemId: p.id, giverId: giver.id }),
        purchase(giver.id, 10, "pay_during_fund"),
      ]);
      expect(fund.ok).toBe(true);
      expect(credit.credited).toBe(true);
      expect(await balance(giver.id)).toBe(10);
    });

    it("cannot be funded twice by two concurrent attempts", async () => {
      const giver = await mkUser("200");
      const p = await draft(giver.id, "50");
      const results = await Promise.all([1, 2, 3].map(() => credits.fundProblemFromCredits({ problemId: p.id, giverId: giver.id })));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await balance(giver.id)).toBe(145);
    });
  });
});
