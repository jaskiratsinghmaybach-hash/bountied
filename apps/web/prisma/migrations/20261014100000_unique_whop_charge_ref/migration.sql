-- A payment reference must be credited at most once. NULL is intentionally
-- allowed for non-Whop ledger entries; PostgreSQL permits multiple NULLs in a
-- unique index. Stop explicitly if historical duplicates need manual review.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CreditTransaction"
    WHERE "whopChargeRef" IS NOT NULL
    GROUP BY "whopChargeRef"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate CreditTransaction.whopChargeRef values exist; resolve them before applying this migration';
  END IF;
END $$;

CREATE UNIQUE INDEX "CreditTransaction_whopChargeRef_key"
ON "CreditTransaction"("whopChargeRef");
