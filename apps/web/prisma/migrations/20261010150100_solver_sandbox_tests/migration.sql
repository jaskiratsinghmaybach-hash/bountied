-- Solver-side sandbox testing: a Solver runs the sandbox on their own repo
-- before submitting. Every run is tied to the exact commit it tested.
-- Purely additive: new enums, new nullable/defaulted columns, one new table.

-- CreateEnum
CREATE TYPE "SolverTestStatus" AS ENUM ('RUNNING', 'PASSED', 'FAILED', 'ERROR');

-- CreateEnum
CREATE TYPE "SubmissionTestStatus" AS ENUM ('UNTESTED', 'PASSED');

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "testRunId" TEXT,
ADD COLUMN     "testStatus" "SubmissionTestStatus" NOT NULL DEFAULT 'UNTESTED',
ADD COLUMN     "testedCommitSha" TEXT;

-- CreateTable
CREATE TABLE "SolverTestRun" (
    "id" TEXT NOT NULL,
    "solverId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "status" "SolverTestStatus" NOT NULL DEFAULT 'RUNNING',
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "chargedFromCredit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "chargedFromEarnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedAt" TIMESTAMP(3),
    "mode" TEXT,
    "exitCode" INTEGER,
    "output" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SolverTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolverTestRun_solverId_problemId_createdAt_idx" ON "SolverTestRun"("solverId", "problemId", "createdAt");

-- CreateIndex
CREATE INDEX "SolverTestRun_problemId_commitSha_idx" ON "SolverTestRun"("problemId", "commitSha");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "SolverTestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolverTestRun" ADD CONSTRAINT "SolverTestRun_solverId_fkey" FOREIGN KEY ("solverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolverTestRun" ADD CONSTRAINT "SolverTestRun_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
