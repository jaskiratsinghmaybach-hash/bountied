# Commit history implementation handoff — 2026-10-14

Starting point: `bountied-hardening-v5.zip` (the user's confirmed local baseline). No live Supabase changes or GitHub pushes were performed by this work.

## Files added/changed

- `apps/web/src/components/problems/commit-history-panel.tsx`: right-side commit chain, inner scroll, search, paged history, 500 ms hover tooltip, selected/unavailable states, cached prior history.
- `apps/web/src/components/problems/submission-form.tsx`: two-column layout, selected SHA hidden field, draft persistence for repository/SHA/write-up.
- `apps/web/src/components/problems/solver-test-panel.tsx`, `solver-test-view.tsx`: test a selected SHA and describe exact-commit results.
- `apps/web/src/app/api/github/repos/commits/route.ts`: authenticated paginated GitHub history API.
- `apps/web/src/lib/github/repo-snapshot.ts`, `head-commit.ts`: fetch/verify an explicit commit SHA.
- `apps/web/src/lib/solver-tests/handlers.ts`, `service.ts`, `deps.ts`: exact-commit preflight, execution fingerprint and passing-run cache reuse before charging.
- `apps/web/src/lib/sandbox/clone.ts`, `execute.ts`: fetch/checkout the selected SHA for sandbox execution.
- `apps/web/src/lib/solver-tests/submit-gate.ts`, `apps/web/src/lib/problems/submission-actions.ts`: submit the chosen commit, revalidate it with GitHub, store immutable SHA.
- `apps/web/src/lib/github/mirror.ts`: create a history-free snapshot repository from the chosen commit, pushing only a new `main` root commit.
- `apps/web/prisma/schema.prisma` and migration `20261014130000_commit_persistence_and_selected_snapshot`.
- `docs/commit-history-and-persistence.md`.

## Migration and checks

Development database:

```powershell
npm run db:migrate
npm run db:generate
npm run typecheck
npm run test --workspace apps/web
npm run lint
```

Production database: review and back up first, then use `npm run db:deploy --workspace apps/web`, followed by the other checks.

The current sandbox did not have the project's `node_modules`, so the full TypeScript typecheck, Vitest suite, ESLint, Prisma validation, and live E2B/GitHub integration tests could not be run here. A TypeScript syntax transpilation pass completed for 240 `.ts`/`.tsx` files with no syntax diagnostics. Treat this archive as an implementation candidate pending the full local verification commands above.
