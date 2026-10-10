-- Solver-side sandbox tests: a Solver paying for a test of their own repo is
-- recorded as SANDBOX_TEST. This is its own migration on purpose: a new enum
-- value cannot be used in the same transaction that adds it.

-- AlterEnum
ALTER TYPE "CreditTransactionType" ADD VALUE 'SANDBOX_TEST';
