import { prisma } from "@/lib/db";
import {
  MAX_SUBMISSION_ATTEMPTS,
  SOLVER_FREE_TEST_BOUNTY_LIMIT,
  SOLVER_MAX_CONCURRENT_TESTS,
  SOLVER_TEST_COST_USD,
  SOLVER_TEST_STALE_MS,
  centsToAmount,
  centsToUsd,
  isFreeTestAvailable,
  planCharge,
  toCents,
} from "./charge";

/**
 * Solver-side sandbox tests: billing and lifecycle. Deliberately NOT a
 * "use server" file: every export of a "use server" module is callable from
 * a browser with arbitrary arguments (the bug that start-review.ts fixed for
 * Giver reviews). Callers pass a solverId they have ALREADY authenticated
 * from the session or device token, never from a request body.
 *
 * Zero-source: a run's `output` is the Solver's own program output. It is
 * stored on SolverTestRun and shown only to that Solver. No Giver-facing
 * route may read SolverTestRun.output / errorMessage. The only things a Giver
 * ever sees are Submission.testStatus and Submission.testedCommitSha.
 *
 * Concurrency: begin takes a row lock on the Solver's User row, so two
 * parallel requests from the same Solver are serialized. That is what makes
 * "one free test per bounty", the 5-bounty cap and the balance check
 * race-free, the same property start-review.ts gets from conditional updates.
 */

export type SolverTestErrorCode =
  | "INVALID_COMMIT"
  | "NOT_FOUND"
  | "NOT_OPEN"
  | "OWN_PROBLEM"
  | "ATTEMPTS_EXHAUSTED"
  | "TOO_MANY_RUNNING"
  | "INSUFFICIENT_FUNDS";

class SolverTestError extends Error {
  code: SolverTestErrorCode;
  details: { requiredUsd?: number; availableUsd?: number };
  constructor(
    code: SolverTestErrorCode,
    message: string,
    details: { requiredUsd?: number; availableUsd?: number } = {}
  ) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/** Flat shape (not a union) so it narrows under this repo's `strict: false`. */
export type BeginSolverTestResult = {
  ok: boolean;
  code?: SolverTestErrorCode;
  message?: string;
  runId?: string;
  isFree?: boolean;
  chargedFromCredit?: number;
  chargedFromEarnings?: number;
  /** INSUFFICIENT_FUNDS only. */
  requiredUsd?: number;
  availableUsd?: number;
};

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const MAX_OUTPUT_CHARS = 20_000;
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

/**
 * Atomically: lock the Solver, check the bounty accepts tests, decide free vs
 * paid, debit credit-then-earnings, and create the RUNNING run. If anything
 * throws, the debit and the run are both rolled back.
 */
export async function beginSolverTest(params: {
  solverId: string;
  problemId: string;
  repoUrl: string;
  /** Exact 40-hex commit the caller resolved from GitHub. */
  commitSha: string;
}): Promise<BeginSolverTestResult> {
  const { solverId, problemId, repoUrl, commitSha } = params;
  if (!COMMIT_SHA.test(commitSha)) {
    return { ok: false, code: "INVALID_COMMIT", message: "Could not determine the commit to test." };
  }

  // A crashed earlier run must not keep holding a concurrency slot or the free quota.
  await reapStaleSolverTests(solverId);

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${solverId} FOR UPDATE`;

      const problem = await tx.problem.findUnique({
        where: { id: problemId },
        select: { id: true, status: true, giverId: true },
      });
      if (!problem) throw new SolverTestError("NOT_FOUND", "Problem not found.");
      if (problem.status !== "OPEN") {
        throw new SolverTestError("NOT_OPEN", "This problem is no longer accepting submissions.");
      }
      if (problem.giverId === solverId) {
        throw new SolverTestError("OWN_PROBLEM", "You can't test a solution on your own problem.");
      }

      const attempts = await tx.submission.count({ where: { problemId, solverId } });
      if (attempts >= MAX_SUBMISSION_ATTEMPTS) {
        throw new SolverTestError(
          "ATTEMPTS_EXHAUSTED",
          `You've used all ${MAX_SUBMISSION_ATTEMPTS} submission attempts for this problem.`
        );
      }

      const running = await tx.solverTestRun.count({ where: { solverId, status: "RUNNING" } });
      if (running >= SOLVER_MAX_CONCURRENT_TESTS) {
        throw new SolverTestError("TOO_MANY_RUNNING", "Wait for your running test to finish first.");
      }

      const freeOnThisProblem = await tx.solverTestRun.count({
        where: { solverId, problemId, isFree: true, status: { not: "ERROR" } },
      });
      const freeBounties = await tx.solverTestRun.groupBy({
        by: ["problemId"],
        where: { solverId, isFree: true, status: { not: "ERROR" } },
      });
      const isFree = isFreeTestAvailable({
        freeUsedOnThisProblem: freeOnThisProblem > 0,
        bountiesWithFreeTest: freeBounties.length,
      });

      let fromCredit = 0;
      let fromEarnings = 0;
      if (!isFree) {
        const balances = await tx.user.findUniqueOrThrow({
          where: { id: solverId },
          select: { creditBalance: true, availableBalance: true },
        });
        const costCents = toCents(SOLVER_TEST_COST_USD);
        const plan = planCharge(costCents, toCents(balances.creditBalance), toCents(balances.availableBalance));
        if (!plan.ok) {
          throw new SolverTestError("INSUFFICIENT_FUNDS", "Not enough balance to run this test.", {
            requiredUsd: centsToUsd(costCents),
            availableUsd: centsToUsd(toCents(balances.creditBalance) + toCents(balances.availableBalance)),
          });
        }
        fromCredit = plan.fromCredit;
        fromEarnings = plan.fromEarnings;

        // The lock already guarantees the numbers above, but the debit is still
        // conditional in SQL so a bug elsewhere can never push a balance negative.
        const debited = await tx.user.updateMany({
          where: {
            id: solverId,
            creditBalance: { gte: centsToAmount(fromCredit) },
            availableBalance: { gte: centsToAmount(fromEarnings) },
          },
          data: {
            creditBalance: { decrement: centsToAmount(fromCredit) },
            availableBalance: { decrement: centsToAmount(fromEarnings) },
          },
        });
        if (debited.count !== 1) {
          throw new SolverTestError("INSUFFICIENT_FUNDS", "Not enough balance to run this test.");
        }

        if (fromCredit > 0) {
          const after = await tx.user.findUniqueOrThrow({
            where: { id: solverId },
            select: { creditBalance: true },
          });
          await tx.creditTransaction.create({
            data: {
              userId: solverId,
              type: "SANDBOX_TEST",
              amount: `-${centsToAmount(fromCredit)}`,
              balanceAfter: after.creditBalance,
              problemId,
            },
          });
        }
      }

      const run = await tx.solverTestRun.create({
        data: {
          solverId,
          problemId,
          repoUrl,
          commitSha,
          status: "RUNNING",
          isFree,
          chargedFromCredit: centsToAmount(fromCredit),
          chargedFromEarnings: centsToAmount(fromEarnings),
        },
        select: { id: true },
      });

      return {
        ok: true,
        runId: run.id,
        isFree,
        chargedFromCredit: centsToUsd(fromCredit),
        chargedFromEarnings: centsToUsd(fromEarnings),
      };
    }, TX_OPTIONS);
  } catch (err) {
    if (err instanceof SolverTestError) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        requiredUsd: err.details.requiredUsd,
        availableUsd: err.details.availableUsd,
      };
    }
    throw err;
  }
}

export type SolverTestOutcome = {
  status: "PASSED" | "FAILED" | "ERROR";
  /** "tests" or "entry". */
  mode?: string | null;
  exitCode?: number | null;
  output?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type CompleteSolverTestResult = {
  /** False when the run had already finished (or been reaped); nothing was changed. */
  ok: boolean;
  refunded?: boolean;
  refundedUsd?: number;
};

/**
 * Records the outcome of a RUNNING test. Only the first completion counts. An
 * ERROR outcome (platform or setup failure, not the Solver's code failing) is
 * always refunded and, because ERROR runs are excluded from the free-quota
 * count, never consumes the free test either.
 */
export async function completeSolverTest(
  runId: string,
  outcome: SolverTestOutcome
): Promise<CompleteSolverTestResult> {
  const updated = await prisma.solverTestRun.updateMany({
    where: { id: runId, status: "RUNNING" },
    data: {
      status: outcome.status,
      mode: outcome.mode ?? null,
      exitCode: outcome.exitCode ?? null,
      output: outcome.output == null ? null : clip(outcome.output),
      errorCode: outcome.errorCode ?? null,
      errorMessage: outcome.errorMessage == null ? null : clip(outcome.errorMessage),
      finishedAt: new Date(),
    },
  });
  if (updated.count !== 1) return { ok: false };

  if (outcome.status === "ERROR") {
    const refund = await refundSolverTest(runId);
    return { ok: true, refunded: refund.refunded, refundedUsd: refund.creditUsd + refund.earningsUsd };
  }
  return { ok: true, refunded: false, refundedUsd: 0 };
}

export type RefundSolverTestResult = {
  refunded: boolean;
  creditUsd: number;
  earningsUsd: number;
};

/**
 * Gives back exactly what the run charged, to the same two balances it came
 * from. Idempotent: the claim (refundedAt) is a conditional update, so a
 * double call, a retry, or the reaper racing completion refunds at most once.
 */
export async function refundSolverTest(runId: string): Promise<RefundSolverTestResult> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.solverTestRun.updateMany({
      where: { id: runId, status: "ERROR", refundedAt: null },
      data: { refundedAt: new Date() },
    });
    if (claimed.count !== 1) return { refunded: false, creditUsd: 0, earningsUsd: 0 };

    const run = await tx.solverTestRun.findUniqueOrThrow({
      where: { id: runId },
      select: { solverId: true, problemId: true, chargedFromCredit: true, chargedFromEarnings: true },
    });
    const credit = toCents(run.chargedFromCredit);
    const earnings = toCents(run.chargedFromEarnings);

    if (credit > 0 || earnings > 0) {
      await tx.user.update({
        where: { id: run.solverId },
        data: {
          creditBalance: { increment: centsToAmount(credit) },
          availableBalance: { increment: centsToAmount(earnings) },
        },
      });
    }
    if (credit > 0) {
      const after = await tx.user.findUniqueOrThrow({
        where: { id: run.solverId },
        select: { creditBalance: true },
      });
      await tx.creditTransaction.create({
        data: {
          userId: run.solverId,
          type: "REFUND",
          amount: centsToAmount(credit),
          balanceAfter: after.creditBalance,
          problemId: run.problemId,
        },
      });
    }
    return { refunded: credit > 0 || earnings > 0, creditUsd: centsToUsd(credit), earningsUsd: centsToUsd(earnings) };
  }, TX_OPTIONS);
}

/**
 * Turns RUNNING tests that never finished (server crash, lost function, killed
 * sandbox) into refunded ERROR runs, so they can't hold a concurrency slot or
 * the free quota forever. Safe to call often and from a scheduled job.
 */
export async function reapStaleSolverTests(solverId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - SOLVER_TEST_STALE_MS);
  const stale = await prisma.solverTestRun.findMany({
    where: { status: "RUNNING", createdAt: { lt: cutoff }, ...(solverId ? { solverId } : {}) },
    select: { id: true },
    take: 100,
  });

  let reaped = 0;
  for (const { id } of stale) {
    const marked = await prisma.solverTestRun.updateMany({
      where: { id, status: "RUNNING" },
      data: {
        status: "ERROR",
        errorCode: "PLATFORM_ERROR",
        errorMessage: "The test did not finish. You were not charged.",
        finishedAt: new Date(),
      },
    });
    if (marked.count === 1) {
      await refundSolverTest(id);
      reaped += 1;
    }
  }
  return reaped;
}

export type SolverTestQuote = {
  costUsd: number;
  /** The next test on this bounty would be free. */
  free: boolean;
  /** How many more bounties could still get a free test (not counting this one). */
  freeBountiesRemaining: number;
  creditUsd: number;
  earningsUsd: number;
  canAfford: boolean;
  shortfallUsd: number;
};

/**
 * Read-only price disclosure for the UI ("this run is free" / "this run costs
 * $0.04, taken from your credit first"). Informational only: beginSolverTest
 * decides again, under a lock, when the Solver actually clicks run.
 */
export async function getSolverTestQuote(params: {
  solverId: string;
  problemId: string;
}): Promise<SolverTestQuote> {
  const { solverId, problemId } = params;
  const [user, freeOnThisProblem, freeBounties] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: solverId },
      select: { creditBalance: true, availableBalance: true },
    }),
    prisma.solverTestRun.count({
      where: { solverId, problemId, isFree: true, status: { not: "ERROR" } },
    }),
    prisma.solverTestRun.groupBy({
      by: ["problemId"],
      where: { solverId, isFree: true, status: { not: "ERROR" } },
    }),
  ]);

  const free = isFreeTestAvailable({
    freeUsedOnThisProblem: freeOnThisProblem > 0,
    bountiesWithFreeTest: freeBounties.length,
  });
  const costCents = toCents(SOLVER_TEST_COST_USD);
  const plan = planCharge(costCents, toCents(user.creditBalance), toCents(user.availableBalance));

  return {
    costUsd: centsToUsd(costCents),
    free,
    freeBountiesRemaining: Math.max(0, SOLVER_FREE_TEST_BOUNTY_LIMIT - freeBounties.length),
    creditUsd: centsToUsd(toCents(user.creditBalance)),
    earningsUsd: centsToUsd(toCents(user.availableBalance)),
    canAfford: free || plan.ok,
    shortfallUsd: free ? 0 : centsToUsd(plan.shortfall),
  };
}

function clip(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_OUTPUT_CHARS) + `\n\n[truncated — ${text.length - MAX_OUTPUT_CHARS} more characters]`;
}
