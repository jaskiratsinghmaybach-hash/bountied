# Solver commit selection, test reuse, and submission snapshots

## Behavior

- The solver submission form includes a compact, internally scrollable commit history panel. It loads GitHub history in pages of 50 and can load older pages without scrolling the whole page.
- Selecting a commit pins preflight, sandbox execution, submission validation, and mirroring to that exact 40-character SHA. If no commit is manually selected, the latest visible commit is selected automatically; the server independently pins a SHA at submission time.
- The panel remembers previously seen commits in local browser storage. After the current reachable history is fully paged, commits that were previously visible but no longer appear are shown disabled as unavailable. GitHub's authenticated API is the source of truth at submission and test time.
- Hovering a commit for 500 ms reveals author, date, full SHA, and a GitHub link.
- The form draft (repository, selected SHA, and write-up) is stored in browser local storage. Authentication remains server-controlled.
- Successful solver test runs are reused only for the same solver, bounty, normalized repository URL, exact commit SHA, and execution fingerprint (runtime, plan/manifest, entrypoint and dependency policy). A cache hit costs $0 and does not start another sandbox.
- The platform mirror fetches the selected commit at shallow depth, exports its tree, removes source Git metadata, initializes a new repository with a single root commit, and pushes only `main`. It does not push source branches, tags, or history. The private destination repository remains subject to the existing reveal/escrow gate.

## Migration

From the repository root:

```powershell
npm run db:migrate
npm run typecheck
npm run test --workspace apps/web
npm run lint
```

For production, use `npm run db:deploy --workspace apps/web` after review and a database backup; `db:migrate` is the development workflow. Review the SQL and backup policy before applying to production. The migration adds `Submission.sourceCommitSha` and `SolverTestRun.executionFingerprint`, plus an index for lookup. Existing rows remain nullable and are not backfilled automatically.

## Manual verification

1. Select a repository. The latest commit should be selected automatically and the history appears in the right panel.
2. Select an older commit. The test panel should check and run that SHA, even if the repository default branch is newer.
3. Run a passing test. Check the exact SHA and output.
4. Run the same test again without changing the execution-affecting configuration. The preflight quote should show a reusable passing result at $0, and starting it should return the stored result without starting a sandbox.
5. Push a new commit. Refresh history: the new commit should appear, while the prior commit remains selectable if GitHub still exposes it.
6. Force-push away a previously seen commit, then page through the reachable history. The old commit should be shown as unavailable, and server-side test/submission validation must reject it.
7. Submit an older tested commit while a newer commit exists. Inspect the private platform mirror: its `main` tree should match the selected commit, its history should contain only a new root snapshot commit, and it must have no copied source branches or tags.
8. Refresh the submission form. The selected repository, commit and write-up should restore. Verify the selected commit is revalidated against GitHub before test or submission.

## Important limitations

- The client-side history cache is only a UI aid. It cannot prove a commit exists or authorize a test; every server operation checks the requested SHA against GitHub.
- GitHub may refuse a fetch of a commit SHA if the object is no longer fetchable. This is treated as unavailable and fails closed; the mirror never silently falls back to HEAD.
- The mirror uses a new root commit, not the original Git SHA, to prevent exposing surrounding source history. `Submission.sourceCommitSha` preserves the original selected SHA for auditability.
- Test reuse depends on the execution fingerprint being updated whenever an execution-affecting input or sandbox runtime/template policy changes.
