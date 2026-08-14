-- Bounty creation flow: language/scope/addons + workspace reference fields (§7, §13.6)

ALTER TABLE "Problem" ADD COLUMN "language" TEXT DEFAULT 'python';
ALTER TABLE "Problem" ADD COLUMN "scope" TEXT;
ALTER TABLE "Problem" ADD COLUMN "addons" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Problem" ADD COLUMN "referenceRepoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Problem" ADD COLUMN "screenshotUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Problem" ADD COLUMN "logs" TEXT;
