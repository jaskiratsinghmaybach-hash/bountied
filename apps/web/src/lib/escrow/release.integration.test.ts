
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl, resetTestDatabase } from "@/test/db";

vi.mock("@/lib/github/grant-access", () => ({
  grantGiverRepoAccess: vi.fn(),
}));

const url = getTestDatabaseUrl();

describe.skipIf(!url)("acceptSubmissionAndRelease (real Postgres)", () => {
  let prisma: typeof import("@/lib/db").prisma;
  let acceptSubmissionAndRelease: typeof import("./release").acceptSubmissionAndRelease;
  let seq = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = url as string;
    await resetTestDatabase(url as string);

    prisma = (await import("@/lib/db")).prisma;
    ({ acceptSubmissionAndRelease } = await import("./release"));
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("credits exactly one solver when two acceptances race", async () => {
    const id = ++seq;

    const giver = await prisma.user.create({
      data: {
        id: `race-giver-${id}`,
        email: `race-giver-${id}@test.dev`,
        name: "Giver",
      },
    });

    const solverA = await prisma.user.create({
      data: {
        id: `race-solver-a-${id}`,
        email: `race-solver-a-${id}@test.dev`,
        name: "Solver A",
      },
    });

    const solverB = await prisma.user.create({
      data: {
        id: `race-solver-b-${id}`,
        email: `race-solver-b-${id}@test.dev`,
        name: "Solver B",
      },
    });

    const problem = await prisma.problem.create({
      data: {
        id: `race-problem-${id}`,
        title: "Concurrent acceptance test",
        description: "Test escrow concurrency",
        tags: [],
        type: "OPEN_BOUNTY",
        status: "OPEN",
        giverId: giver.id,
      },
    });

    await prisma.escrow.create({
      data: {
        problemId: problem.id,
        amount: 100,
        state: "HELD",
      },
    });

    const submissionA = await prisma.submission.create({
      data: {
        id: `race-submission-a-${id}`,
        problemId: problem.id,
        solverId: solverA.id,
        status: "AWAITING_REVIEW",
        repoUrl: "https://github.com/solver-a/repo",
        writeup: "Submission A",
      },
    });

    const submissionB = await prisma.submission.create({
      data: {
        id: `race-submission-b-${id}`,
        problemId: problem.id,
        solverId: solverB.id,
        status: "AWAITING_REVIEW",
        repoUrl: "https://github.com/solver-b/repo",
        writeup: "Submission B",
      },
    });

    const results = await Promise.all([
      acceptSubmissionAndRelease({
        problemId: problem.id,
        submissionId: submissionA.id,
        actingGiverId: giver.id,
      }),
      acceptSubmissionAndRelease({
        problemId: problem.id,
        submissionId: submissionB.id,
        actingGiverId: giver.id,
      }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);

    const [updatedA, updatedB, updatedEscrow, updatedProblem, balanceA, balanceB] =
      await Promise.all([
        prisma.submission.findUniqueOrThrow({ where: { id: submissionA.id } }),
        prisma.submission.findUniqueOrThrow({ where: { id: submissionB.id } }),
        prisma.escrow.findUniqueOrThrow({ where: { problemId: problem.id } }),
        prisma.problem.findUniqueOrThrow({ where: { id: problem.id } }),
        prisma.user.findUniqueOrThrow({ where: { id: solverA.id } }),
        prisma.user.findUniqueOrThrow({ where: { id: solverB.id } }),
      ]);

    expect(updatedEscrow.state).toBe("RELEASED");
    expect([
      submissionA.id,
      submissionB.id,
    ]).toContain(updatedEscrow.releasedToSubmissionId);

    const accepted = [updatedA, updatedB].filter(
      (submission) => submission.status === "ACCEPTED" && submission.isRevealed,
    );
    expect(accepted).toHaveLength(1);

    const rejected = [updatedA, updatedB].filter(
      (submission) => submission.status === "REJECTED",
    );
    expect(rejected).toHaveLength(1);

    expect(updatedProblem.status).toBe("COMPLETED");

    const creditedBalances = [Number(balanceA.availableBalance), Number(balanceB.availableBalance)];
    expect(creditedBalances.sort((a, b) => a - b)).toEqual([0, 95]);

    const creditedEarned = [Number(balanceA.totalEarned), Number(balanceB.totalEarned)];
    expect(creditedEarned.sort((a, b) => a - b)).toEqual([0, 100]);

    const completionCounts = [balanceA.completionCount, balanceB.completionCount];
    expect(completionCounts.sort((a, b) => a - b)).toEqual([0, 1]);
  });
});
