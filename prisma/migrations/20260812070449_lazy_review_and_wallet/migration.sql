-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'AWAITING_REVIEW';

-- AlterEnum
ALTER TYPE "CreditTransactionType" ADD VALUE 'SUBMISSION_REVIEW';

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN "freeReviewsUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CreditTransaction" ADD COLUMN "submissionId" TEXT;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;