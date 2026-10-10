# Bountied

Escrow bounty platform. Givers post and fund bounties, Solvers build solutions in their own GitHub repo (up to 3 attempts), Givers review in an isolated sandbox and release escrow on acceptance.

**Zero-source disclosure:** Solver source never reaches the Giver before escrow release. Sandbox output is untrusted, and the server is authoritative for payment and reveal.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js 16 website and API (Prisma, Supabase auth, Whop payments, E2B sandboxes) |
| `apps/desktop` | Tauri v2 desktop app for Givers (Rust, React, Vite). Talks only to the website API |
| `packages/shared` | Shared types and constants (fees, review pricing, API contracts) |
| `docs/` | Architecture and security notes |

## Setup

Requirements: Node 20+, npm, Rust (for desktop), PostgreSQL via Supabase.

```powershell
npm install
copy apps\web\.env.example apps\web\.env        # then fill in values
copy apps\desktop\.env.example apps\desktop\.env
npm run db:generate
```

## Scripts (run from the repo root)

| Command | Does |
|---|---|
| `npm run dev:web` | Website at http://localhost:3000 |
| `npm run dev:desktop` | Desktop app (set `$env:BOUNTIED_API_URL = "http://localhost:3000"` first; first Rust build is slow) |
| `npm run build:web` / `build:desktop` | Production builds |
| `npm run typecheck` | Typecheck every workspace |
| `npm run lint` / `npm run test` | Lint / tests across workspaces |
| `npm run db:generate` / `db:migrate` | Prisma client / migrations (run in `apps/web`) |

## Known issues

- `apps/web` has 25 pre-existing TypeScript errors (9 files) and `apps/desktop` has 2 (`Login.tsx`). `next build` and `tauri build` fail on type-check until these are fixed.
- Windows: if `cargo` fails with `os error 1455`, run `cargo clean`, enlarge the paging file, and keep `jobs = 2` in `apps/desktop/src-tauri/.cargo/config.toml`.

## Deployment

Vercel project Root Directory must be `apps/web`.

## Checkpoints

Rollback points are git tags named `checkpoint/YYYY-MM-DD-<name>`, listed in [CHECKPOINTS.md](CHECKPOINTS.md).

## Secrets

Never commit `.env` files. Each app has a `.env.example` listing the variable names.
