# Checkpoints

Rollback points are annotated by git tags named `checkpoint/YYYY-MM-DD-<name>`. The `checkpoints` branch marks the first one.

| Tag | Commit | What it is |
|---|---|---|
| `checkpoint/2026-10-09-pre-monorepo` | `ab2dfda` | `main` immediately before the monorepo restructure |

## Create a checkpoint

```powershell
git tag checkpoint/YYYY-MM-DD-name
git push origin checkpoint/YYYY-MM-DD-name
```
Then add a row to the table above.

## Restore from a checkpoint

Inspect without changing anything:
```powershell
git checkout checkpoint/2026-10-09-pre-monorepo
```
Start new work from it:
```powershell
git switch -c rescue/from-checkpoint checkpoint/2026-10-09-pre-monorepo
```
Never force-push `main` to restore. Branch from the tag and merge or cherry-pick instead.
