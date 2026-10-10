-- Drop the old provider-driven verification columns.
ALTER TABLE "User" DROP COLUMN IF EXISTS "bankVerified";
ALTER TABLE "User" DROP COLUMN IF EXISTS "whopPayoutMethodId";

-- Add the manually-collected bank detail columns (v1: no external
-- verification API, solver-entered, admin pays out by hand via Wise).
ALTER TABLE "User" ADD COLUMN     "bankDetailsAdded"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN     "bankCountry"       TEXT;
ALTER TABLE "User" ADD COLUMN     "bankAccountNumber" TEXT;
ALTER TABLE "User" ADD COLUMN     "bankIfscOrSwift"   TEXT;

-- PayoutRequest: drop the old provider automation column, add the
-- bank-detail snapshot + 7-day eligibility window.
ALTER TABLE "PayoutRequest" DROP COLUMN IF EXISTS "providerRef";

-- Backfill-safe: these are NOT NULL, so for a fresh DB with no existing
-- rows this is fine as-is. If you have existing PayoutRequest rows,
-- run a manual backfill before applying NOT NULL, or drop this table's
-- data first (v1, no live payouts have gone through it yet).
ALTER TABLE "PayoutRequest" ADD COLUMN     "legalName"         TEXT NOT NULL DEFAULT '';
ALTER TABLE "PayoutRequest" ADD COLUMN     "bankCountry"       TEXT NOT NULL DEFAULT '';
ALTER TABLE "PayoutRequest" ADD COLUMN     "bankAccountNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PayoutRequest" ADD COLUMN     "bankIfscOrSwift"   TEXT NOT NULL DEFAULT '';
ALTER TABLE "PayoutRequest" ADD COLUMN     "eligibleAt"        TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');

-- Drop the temporary defaults now that existing rows (if any) are backfilled —
-- new rows must always supply these explicitly going forward.
ALTER TABLE "PayoutRequest" ALTER COLUMN "legalName" DROP DEFAULT;
ALTER TABLE "PayoutRequest" ALTER COLUMN "bankCountry" DROP DEFAULT;
ALTER TABLE "PayoutRequest" ALTER COLUMN "bankAccountNumber" DROP DEFAULT;
ALTER TABLE "PayoutRequest" ALTER COLUMN "bankIfscOrSwift" DROP DEFAULT;
ALTER TABLE "PayoutRequest" ALTER COLUMN "eligibleAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "PayoutRequest_status_idx" ON "PayoutRequest"("status");
