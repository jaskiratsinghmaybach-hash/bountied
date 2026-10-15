# Bountied persistent test history + role-aware header balance

This patch is based on the commit-history implementation already applied to the project. It intentionally does not change the commit-history layout or database schema.

## Changes
- Adds `GET /api/solver-tests/history`, scoped to the signed-in Solver and exact problem/repository/full commit SHA. It returns only that Solver's latest run, including status, exit code and output; it never exposes runs to Givers.
- On initial load and commit selection, the solver test panel restores the latest persisted run from the database. A RUNNING run resumes polling; a completed run restores without rerunning.
- Header shows Givers their wallet credit balance and Solvers their combined deposited credit + available earnings. The amount links to the relevant funds page and remains visible while submitting because the header is global.

## Apply
Extract this ZIP at the repository root (`D:\bountied`) and overwrite the included files. No migration is required.

## Verify
```powershell
npm run lint
npm run typecheck
npm run test --workspace apps/web
```
Then test one exact commit: run it, switch commits, switch back, refresh, and confirm the same stored output/exit code returns without another charge. Also sign in once as a Giver and once as a Solver to verify the respective header balance and destination.
