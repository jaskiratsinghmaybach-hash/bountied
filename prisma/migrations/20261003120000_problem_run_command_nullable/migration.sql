-- Review Engine fix (docs/review-engine-architecture.md §8, step 1 ONLY).
-- Problem.runCommand was a Giver-authored free-text field that was executed
-- verbatim inside the Solver's cloned repo. Nothing reads or writes it now;
-- make it nullable so new Problems no longer need a value. Existing rows are
-- left untouched. The column is intentionally NOT dropped here — that is a
-- separate cleanup migration once nothing references it.
ALTER TABLE "Problem" ALTER COLUMN "runCommand" DROP NOT NULL;
