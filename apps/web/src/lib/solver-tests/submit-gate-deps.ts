import { prisma } from "@/lib/db";
import { fetchHeadCommitSha } from "@/lib/github/head-commit";
import type { SubmitGateDeps } from "./submit-gate";

/** The real wiring for evaluateSubmitGate. Kept apart so submit-gate.ts is testable without Prisma. */
export const submitGateDeps: SubmitGateDeps = {
  findRuns: ({ solverId, problemId }) =>
    prisma.solverTestRun.findMany({
      where: { solverId, problemId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, repoUrl: true, commitSha: true, status: true, errorCode: true, errorMessage: true, createdAt: true },
    }),
  fetchHead: ({ repoUrl, token }) => fetchHeadCommitSha({ repoUrl, token }),
};
