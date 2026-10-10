-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "platformRepoFullName" TEXT,
ADD COLUMN     "platformRepoPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "platformRepoUrl" TEXT;
