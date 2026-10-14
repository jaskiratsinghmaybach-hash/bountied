import { after } from "next/server";
import { prisma } from "@/lib/db";
import { runPreflight } from "./preflight";
import { executeSolverTest } from "./run";
import { beginSolverTest, getSolverTestQuote, reapStaleSolverTests } from "./service";
import type { SolverTestDeps } from "./handlers";

/**
 * The real wiring for the Solver test routes. Kept apart from handlers.ts so the
 * handlers can be tested without Prisma, GitHub, E2B or Next.
 *
 * `schedule` uses next/server's `after`, the same mechanism createSubmission
 * already uses: the response (202 + runId) goes out immediately and the sandbox
 * run continues afterwards, even if the Solver closes the tab. The run route
 * sets maxDuration so the platform keeps the function alive long enough.
 */
export const solverTestDeps: SolverTestDeps = {
  findProblem: async (problemId) => {
    const p = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { id: true, status: true, giverId: true, runtime: true, dependencyPolicy: true },
    });
    return p ? { ...p, runtime: p.runtime as "PYTHON" | "NODE" } : null;
  },
  runPreflight: (params) => runPreflight(params),
  getQuote: (params) => getSolverTestQuote(params),
  hasCachedPassedRun: async (params) => !!(await prisma.solverTestRun.findFirst({
    where: { solverId: params.solverId, problemId: params.problemId, repoUrl: params.repoUrl, commitSha: params.commitSha, executionFingerprint: params.executionFingerprint, status: "PASSED" },
    select: { id: true },
  })),
  begin: (params) => beginSolverTest(params),
  execute: (params) => executeSolverTest(params),
  schedule: (task) => {
    after(task);
  },
  findRun: (runId) => prisma.solverTestRun.findUnique({ where: { id: runId } }),
  reap: (solverId) => reapStaleSolverTests(solverId),
};
