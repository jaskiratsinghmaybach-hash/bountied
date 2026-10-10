-- CreateEnum
CREATE TYPE "Runtime" AS ENUM ('PYTHON');

-- CreateEnum
CREATE TYPE "CodeSourceType" AS ENUM ('GITHUB_REPO', 'FILE_UPLOAD');

-- AlterEnum: add new SubmissionStatus values
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'RUNNING';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'SANDBOX_FAILED';

-- AlterTable: Problem gets an execution contract
-- Existing rows (if any DRAFT problems exist from earlier testing) get a
-- placeholder run command — giver should re-edit before publishing, which
-- the existing DRAFT-only edit flow already supports.
ALTER TABLE "Problem" ADD COLUMN     "runtime" "Runtime" NOT NULL DEFAULT 'PYTHON';
ALTER TABLE "Problem" ADD COLUMN     "runCommand" TEXT NOT NULL DEFAULT 'python main.py';
ALTER TABLE "Problem" ALTER COLUMN "runCommand" DROP DEFAULT;

-- AlterTable: Submission — replace the old redacted-preview-text model
-- with real code-source tracking + captured sandbox execution output.
-- No existing rows are expected (submission creation wasn't built until
-- this change), so this is a straightforward column swap rather than a
-- data migration.
ALTER TABLE "Submission" DROP COLUMN IF EXISTS "codeBlobUrl";
ALTER TABLE "Submission" DROP COLUMN IF EXISTS "previewText";

ALTER TABLE "Submission" ADD COLUMN     "codeSourceType" "CodeSourceType" NOT NULL DEFAULT 'GITHUB_REPO';
ALTER TABLE "Submission" ALTER COLUMN "codeSourceType" DROP DEFAULT;
ALTER TABLE "Submission" ADD COLUMN     "codeSourceUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Submission" ALTER COLUMN "codeSourceUrl" DROP DEFAULT;
ALTER TABLE "Submission" ADD COLUMN     "writeup" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Submission" ALTER COLUMN "writeup" DROP DEFAULT;
ALTER TABLE "Submission" ADD COLUMN     "sandboxOutput" TEXT;
ALTER TABLE "Submission" ADD COLUMN     "sandboxExitCode" INTEGER;
ALTER TABLE "Submission" ADD COLUMN     "sandboxRanAt" TIMESTAMP(3);
ALTER TABLE "Submission" ADD COLUMN     "sandboxError" TEXT;
