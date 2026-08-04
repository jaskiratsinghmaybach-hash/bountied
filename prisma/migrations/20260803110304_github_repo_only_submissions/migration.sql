-- Product decision 2026-08-03: submissions are GitHub repo links only,
-- no file/zip upload. Drop the now-unnecessary type discriminator and
-- rename the URL column to reflect what it always is now.

ALTER TABLE "Submission" RENAME COLUMN "codeSourceUrl" TO "repoUrl";
ALTER TABLE "Submission" DROP COLUMN "codeSourceType";
DROP TYPE IF EXISTS "CodeSourceType";
