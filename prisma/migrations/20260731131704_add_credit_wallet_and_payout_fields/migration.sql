-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SOLVER', 'GIVER', 'BOTH');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('PURCHASE', 'BOUNTY_FUNDING', 'REFUND');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "creditBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "role" "UserRole",
ADD COLUMN     "whopPayoutMethodId" TEXT;

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "problemId" TEXT,
    "whopChargeRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_idx" ON "CreditTransaction"("userId");

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
