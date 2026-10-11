import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl, resetTestDatabase } from "@/test/db";

/**
 * Real-Postgres tests for Solver sandbox test billing. They only run when
 * TEST_DATABASE_URL points at a throwaway database (see src/test/db.ts);
 * otherwise the whole file is skipped. They exercise the actual SQL: row
 * locks, conditional debits and idempotent refunds.
 */
const url = getTestDatabaseUrl();

describe.skipIf(!url)("solver test service (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let svc: typeof import("./service");

  beforeAll(async () => {
    process.env.DATABASE_URL = url as string;
    await resetTestDatabase(url as string);
    prisma = (await import("@/lib/db")).prisma;
    svc = await import("./service");
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  // ── helpers ────────────────────────────────────────────────────────────
  let seq = 0;
  const sha = (n = 1) => "a".repeat(39) + (n % 16).toString(16);

  async function mkUser(opts: { credit?: string; earnings?: string } = {}) {
    seq += 1;
    return prisma.user.create({
      data: {
        id: `user${seq}`,
        email: `user${seq}@test.dev`,
        name: `User ${seq}`,
        creditBalance: opts.credit ?? "0",
        availableBalance: opts.earnings ?? "0",
      },
    });
  }

  async function mkProblem(giverId: string, status: "OPEN" | "FUNDED" = "OPEN") {
    seq += 1;
    return prisma.problem.create({
      data: {
        id: `prob${seq}`,
        title: "A bounty",
        description: "Do the thing",
        tags: [],
        type: "OPEN_BOUNTY",
        status,
        giverId,
      },
    });
  }

  async function setup(opts: { credit?: string; earnings?: string; problems?: number } = {}) {
    const giver = await mkUser();
    const solver = await mkUser(opts);
    const problems = [];
    for (let i = 0; i < (opts.problems ?? 1); i += 1) problems.push(await mkProblem(giver.id));
    return { giver, solver, problems };
  }

  const begin = (solverId: string, problemId: string, n = 1) =>
    svc.beginSolverTest({ solverId, problemId, repoUrl: "https://github.com/a/b", commitSha: sha(n) });

  async function bal(userId: string) {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { credit: u.creditBalance.toFixed(2), earnings: u.availableBalance.toFixed(2) };
  }

  const pass = (runId: string) => svc.completeSolverTest(runId, { status: "PASSED", mode: "entry", exitCode: 0 });
  const err = (runId: string) =>
    svc.completeSolverTest(runId, { status: "ERROR", errorCode: "PLATFORM_ERROR", errorMessage: "boom" });

  // ── free quota ─────────────────────────────────────────────────────────
  it("makes the first test on a fresh bounty free and moves no money", async () => {
    const { solver, problems } = await setup({ credit: "1.00", earnings: "0.50" });
    const r = await begin(solver.id, problems[0].id);

    expect(r.ok).toBe(true);
    expect(r.isFree).toBe(true);
    expect(r.chargedFromCredit).toBe(0);
    expect(r.chargedFromEarnings).toBe(0);
    expect(await bal(solver.id)).toEqual({ credit: "1.00", earnings: "0.50" });
    expect(await prisma.creditTransaction.count({ where: { userId: solver.id } })).toBe(0);

    const run = await prisma.solverTestRun.findUniqueOrThrow({ where: { id: r.runId } });
    expect(run.status).toBe("RUNNING");
    expect(run.isFree).toBe(true);
    expect(run.commitSha).toBe(sha());
  });

  it("charges the second test on the same bounty, from credit first", async () => {
    const { solver, problems } = await setup({ credit: "1.00", earnings: "0.50" });
    await pass((await begin(solver.id, problems[0].id)).runId as string);

    const r = await begin(solver.id, problems[0].id, 2);
    expect(r.ok).toBe(true);
    expect(r.isFree).toBe(false);
    expect(r.chargedFromCredit).toBe(0.04);
    expect(r.chargedFromEarnings).toBe(0);
    expect(await bal(solver.id)).toEqual({ credit: "0.96", earnings: "0.50" });

    const tx = await prisma.creditTransaction.findFirstOrThrow({ where: { userId: solver.id } });
    expect(tx.type).toBe("SANDBOX_TEST");
    expect(tx.amount.toFixed(2)).toBe("-0.04");
    expect(tx.balanceAfter.toFixed(2)).toBe("0.96");
  });

  it("gives a free test on the first 5 bounties and charges from the 6th", async () => {
    const { solver, problems } = await setup({ credit: "1.00", problems: 6 });
    for (let i = 0; i < 5; i += 1) {
      const r = await begin(solver.id, problems[i].id);
      expect(r.isFree).toBe(true);
      await pass(r.runId as string);
    }
    const sixth = await begin(solver.id, problems[5].id);
    expect(sixth.ok).toBe(true);
    expect(sixth.isFree).toBe(false);
    await pass(sixth.runId as string);

    // ...and a second test on bounty 1 is paid too.
    const again = await begin(solver.id, problems[0].id, 2);
    expect(again.isFree).toBe(false);
    expect(await bal(solver.id)).toEqual({ credit: "0.92", earnings: "0.00" });
  });

  it("keeps an unused free test available for a later attempt", async () => {
    const { solver, problems } = await setup({ credit: "1.00" });
    const first = await begin(solver.id, problems[0].id);
    await err(first.runId as string); // platform error: free test not consumed
    const retry = await begin(solver.id, problems[0].id, 2);
    expect(retry.isFree).toBe(true);
  });

  it("never lets ERROR runs eat the 5-bounty free quota", async () => {
    const { solver, problems } = await setup({ credit: "1.00", problems: 6 });
    for (let i = 0; i < 5; i += 1) {
      const r = await begin(solver.id, problems[i].id);
      await err(r.runId as string);
    }
    const sixth = await begin(solver.id, problems[5].id);
    expect(sixth.isFree).toBe(true);
  });

  // ── charging ───────────────────────────────────────────────────────────
  it("splits a charge across credit and earnings when credit is short", async () => {
    const { solver, problems } = await setup({ credit: "0.03", earnings: "0.50" });
    await pass((await begin(solver.id, problems[0].id)).runId as string);

    const r = await begin(solver.id, problems[0].id, 2);
    expect(r.ok).toBe(true);
    expect(r.chargedFromCredit).toBe(0.03);
    expect(r.chargedFromEarnings).toBe(0.01);
    expect(await bal(solver.id)).toEqual({ credit: "0.00", earnings: "0.49" });

    const tx = await prisma.creditTransaction.findFirstOrThrow({ where: { userId: solver.id } });
    expect(tx.amount.toFixed(2)).toBe("-0.03");
  });

  it("uses earnings alone when there is no credit, with no wallet transaction", async () => {
    const { solver, problems } = await setup({ credit: "0", earnings: "1.00" });
    await pass((await begin(solver.id, problems[0].id)).runId as string);

    const r = await begin(solver.id, problems[0].id, 2);
    expect(r.chargedFromCredit).toBe(0);
    expect(r.chargedFromEarnings).toBe(0.04);
    expect(await bal(solver.id)).toEqual({ credit: "0.00", earnings: "0.96" });
    expect(await prisma.creditTransaction.count({ where: { userId: solver.id } })).toBe(0);
  });

  it("charges nothing and creates no run when the balance is short", async () => {
    const { solver, problems } = await setup({ credit: "0.02", earnings: "0.01" });
    await pass((await begin(solver.id, problems[0].id)).runId as string);

    const r = await begin(solver.id, problems[0].id, 2);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("INSUFFICIENT_FUNDS");
    expect(r.requiredUsd).toBe(0.04);
    expect(r.availableUsd).toBe(0.03);
    expect(await bal(solver.id)).toEqual({ credit: "0.02", earnings: "0.01" });
    expect(await prisma.solverTestRun.count({ where: { solverId: solver.id } })).toBe(1);
  });

  // ── completion and refunds ─────────────────────────────────────────────
  it("refunds exactly what an ERROR run charged, to the same balances, once", async () => {
    const { solver, problems } = await setup({ credit: "0.03", earnings: "0.50" });
    await pass((await begin(solver.id, problems[0].id)).runId as string);
    const paid = await begin(solver.id, problems[0].id, 2); // 0.03 credit + 0.01 earnings
    expect(await bal(solver.id)).toEqual({ credit: "0.00", earnings: "0.49" });

    const done = await err(paid.runId as string);
    expect(done.ok).toBe(true);
    expect(done.refunded).toBe(true);
    expect(done.refundedUsd).toBe(0.04);
    expect(await bal(solver.id)).toEqual({ credit: "0.03", earnings: "0.50" });

    const refunds = await prisma.creditTransaction.findMany({ where: { userId: solver.id, type: "REFUND" } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount.toFixed(2)).toBe("0.03");

    // Replays do nothing.
    expect((await svc.refundSolverTest(paid.runId as string)).refunded).toBe(false);
    expect((await err(paid.runId as string)).ok).toBe(false);
    expect(await bal(solver.id)).toEqual({ credit: "0.03", earnings: "0.50" });
  });

  it("does not refund a run that finished PASSED or FAILED, and stores the log for the Solver", async () => {
    const { solver, problems } = await setup({ credit: "1.00" });
    await pass((await begin(solver.id, problems[0].id)).runId as string);
    const paid = await begin(solver.id, problems[0].id, 2);

    const done = await svc.completeSolverTest(paid.runId as string, {
      status: "FAILED",
      mode: "tests",
      exitCode: 1,
      output: "1 failed",
    });
    expect(done.refunded).toBe(false);
    expect(await bal(solver.id)).toEqual({ credit: "0.96", earnings: "0.00" });

    const run = await prisma.solverTestRun.findUniqueOrThrow({ where: { id: paid.runId } });
    expect(run.status).toBe("FAILED");
    expect(run.exitCode).toBe(1);
    expect(run.output).toBe("1 failed");
    expect(run.refundedAt).toBeNull();
  });

  it("only applies the first completion", async () => {
    const { solver, problems } = await setup();
    const r = await begin(solver.id, problems[0].id);
    expect((await pass(r.runId as string)).ok).toBe(true);
    expect((await err(r.runId as string)).ok).toBe(false);
    const run = await prisma.solverTestRun.findUniqueOrThrow({ where: { id: r.runId } });
    expect(run.status).toBe("PASSED");
  });

  it("truncates huge output", async () => {
    const { solver, problems } = await setup();
    const r = await begin(solver.id, problems[0].id);
    await svc.completeSolverTest(r.runId as string, { status: "FAILED", exitCode: 1, output: "x".repeat(50_000) });
    const run = await prisma.solverTestRun.findUniqueOrThrow({ where: { id: r.runId } });
    expect((run.output ?? "").length).toBeLessThan(20_200);
    expect(run.output).toContain("[truncated");
  });

  // ── races ──────────────────────────────────────────────────────────────
  it("lets only one of many parallel starts spend exactly enough credit", async () => {
    const { solver, problems } = await setup({ credit: "0.04" });
    await pass((await begin(solver.id, problems[0].id)).runId as string); // use up the free test

    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => begin(solver.id, problems[0].id, i + 2)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => r.code === "INSUFFICIENT_FUNDS").length).toBe(4);
    expect(await bal(solver.id)).toEqual({ credit: "0.00", earnings: "0.00" });
    expect(await prisma.creditTransaction.count({ where: { userId: solver.id, type: "SANDBOX_TEST" } })).toBe(1);
  });

  it("grants one free test per bounty even when requests arrive together", async () => {
    const { solver, problems } = await setup({ credit: "1.00" });
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => begin(solver.id, problems[0].id, i + 1)));

    expect(results.filter((r) => r.ok && r.isFree)).toHaveLength(1);
    const freeRuns = await prisma.solverTestRun.count({
      where: { solverId: solver.id, problemId: problems[0].id, isFree: true },
    });
    expect(freeRuns).toBe(1);
  });

  it("grants only the 5th free bounty when two start together", async () => {
    const { solver, problems } = await setup({ credit: "1.00", problems: 6 });
    for (let i = 0; i < 4; i += 1) await pass((await begin(solver.id, problems[i].id)).runId as string);

    const [a, b] = await Promise.all([begin(solver.id, problems[4].id), begin(solver.id, problems[5].id)]);
    expect([a, b].filter((r) => r.isFree)).toHaveLength(1);
    const freeBounties = await prisma.solverTestRun.groupBy({
      by: ["problemId"],
      where: { solverId: solver.id, isFree: true },
    });
    expect(freeBounties).toHaveLength(5);
  });

  // ── guards ─────────────────────────────────────────────────────────────
  it("rejects a bad commit, a missing bounty, your own bounty and a closed bounty", async () => {
    const { giver, solver, problems } = await setup({ credit: "1.00" });
    const closed = await mkProblem(giver.id, "FUNDED");

    expect((await svc.beginSolverTest({ solverId: solver.id, problemId: problems[0].id, repoUrl: "x", commitSha: "nope" })).code).toBe("INVALID_COMMIT");
    expect((await begin(solver.id, "does-not-exist")).code).toBe("NOT_FOUND");
    expect((await begin(giver.id, problems[0].id)).code).toBe("OWN_PROBLEM");
    expect((await begin(solver.id, closed.id)).code).toBe("NOT_OPEN");
    expect(await prisma.solverTestRun.count({ where: { solverId: solver.id } })).toBe(0);
    expect(await bal(solver.id)).toEqual({ credit: "1.00", earnings: "0.00" });
  });

  it("rejects a test once all 3 submission attempts are used", async () => {
    const { solver, problems } = await setup({ credit: "1.00" });
    for (let n = 1; n <= 3; n += 1) {
      await prisma.submission.create({
        data: {
          problemId: problems[0].id,
          solverId: solver.id,
          repoUrl: "https://github.com/a/b",
          writeup: "x".repeat(40),
          attemptNumber: n,
        },
      });
    }
    const r = await begin(solver.id, problems[0].id);
    expect(r.code).toBe("ATTEMPTS_EXHAUSTED");
    expect(await prisma.solverTestRun.count({ where: { solverId: solver.id } })).toBe(0);
  });

  it("caps tests running at once and charges nothing for the rejected one", async () => {
    const { solver, problems } = await setup({ credit: "1.00", problems: 3 });
    expect((await begin(solver.id, problems[0].id)).ok).toBe(true);
    expect((await begin(solver.id, problems[1].id)).ok).toBe(true);
    const third = await begin(solver.id, problems[2].id);
    expect(third.ok).toBe(false);
    expect(third.code).toBe("TOO_MANY_RUNNING");
    expect(await bal(solver.id)).toEqual({ credit: "1.00", earnings: "0.00" });
  });

  // ── stuck runs ─────────────────────────────────────────────────────────
  it("refunds and errors a test that never finished, and leaves fresh ones alone", async () => {
    const { solver, problems } = await setup({ credit: "1.00", problems: 2 });
    await pass((await begin(solver.id, problems[0].id)).runId as string);
    const stuck = await begin(solver.id, problems[0].id, 2); // paid 0.04
    const fresh = await begin(solver.id, problems[1].id, 3); // free, just started
    await prisma.solverTestRun.update({
      where: { id: stuck.runId },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    expect(await bal(solver.id)).toEqual({ credit: "0.96", earnings: "0.00" });

    expect(await svc.reapStaleSolverTests(solver.id)).toBe(1);

    const stuckRun = await prisma.solverTestRun.findUniqueOrThrow({ where: { id: stuck.runId } });
    expect(stuckRun.status).toBe("ERROR");
    expect(stuckRun.errorCode).toBe("PLATFORM_ERROR");
    expect(stuckRun.refundedAt).not.toBeNull();
    const freshRun = await prisma.solverTestRun.findUniqueOrThrow({ where: { id: fresh.runId } });
    expect(freshRun.status).toBe("RUNNING");
    expect(await bal(solver.id)).toEqual({ credit: "1.00", earnings: "0.00" });
    expect(await svc.reapStaleSolverTests(solver.id)).toBe(0);
  });

  // ── price disclosure ───────────────────────────────────────────────────
  it("quotes the next test without changing anything", async () => {
    const { solver, problems } = await setup({ credit: "0.00", earnings: "0.00" });
    const fresh = await svc.getSolverTestQuote({ solverId: solver.id, problemId: problems[0].id });
    expect(fresh).toMatchObject({ costUsd: 0.04, free: true, freeBountiesRemaining: 5, canAfford: true, shortfallUsd: 0 });

    await pass((await begin(solver.id, problems[0].id)).runId as string);
    const next = await svc.getSolverTestQuote({ solverId: solver.id, problemId: problems[0].id });
    expect(next).toMatchObject({ free: false, freeBountiesRemaining: 4, canAfford: false, shortfallUsd: 0.04 });
  });
});
