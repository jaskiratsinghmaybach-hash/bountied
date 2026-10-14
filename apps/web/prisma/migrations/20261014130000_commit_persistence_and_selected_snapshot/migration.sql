-- Persist the selected immutable source commit and fingerprint cached test runs.
ALTER TABLE "Submission" ADD COLUMN "sourceCommitSha" TEXT;
ALTER TABLE "SolverTestRun" ADD COLUMN "executionFingerprint" TEXT;
CREATE INDEX "SolverTestRun_solverId_problemId_repoUrl_commitSha_status_idx"
  ON "SolverTestRun"("solverId", "problemId", "repoUrl", "commitSha", "status");
