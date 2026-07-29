# Platform (working name) — v1 scaffold

Escrow-backed coding bounty platform. See project chat history for full product spec.

## Stack
- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + Framer Motion
- Prisma + PostgreSQL (via Supabase)
- Supabase Auth + Storage
- Whop SDK for payments (v1) → Stripe planned for final launch

## Getting started (PowerShell, from your D drive)

```powershell
# 1. Install dependencies
npm install

# 2. Set up environment
Copy-Item .env.example .env
# then fill in .env with your Supabase project's connection strings and keys
# (Supabase dashboard -> Project Settings -> Database, and -> API)
# DATABASE_URL = the pooled "Transaction" connection string (used at runtime)
# DIRECT_URL   = the direct "Session" connection string (used by prisma.config.ts for migrations)

# 3. Generate Prisma client and run first migration
npx prisma generate
npx prisma migrate dev --name init

# 4. (Recommended) Add shadcn/ui components as you need them
npx shadcn@latest init
# then e.g.:
npx shadcn@latest add button card dialog input badge avatar

# 5. Run dev server
npm run dev
```

Then open http://localhost:3000

### Note on Prisma 7

This project uses Prisma 7, which changed how connections work: URLs no longer
live in `prisma/schema.prisma` — they live in `prisma.config.ts` (CLI/migrations,
uses `DIRECT_URL`) and are passed explicitly to `PrismaClient` via a driver
adapter in `src/lib/db.ts` (runtime, uses `DATABASE_URL`). If a tutorial or
AI answer shows `url = env("DATABASE_URL")` inside `schema.prisma`, that's the
pre-v7 way and will throw a schema validation error — the two files above are
where that config actually lives now.

## Project structure

```
prisma/schema.prisma        — full data model (User, Problem, Escrow, Submission, Badge, Review)
src/lib/payments/           — payment provider abstraction (Whop now, Stripe-swappable)
src/lib/escrow/release.ts   — THE core trust mechanism: money-moves-before-code-reveals
src/lib/evaluation/         — stub socket for future LLM-assisted review (OpenAI/Anthropic/RunPod)
src/lib/db.ts               — Prisma client singleton
src/components/marketing/   — landing page components (hero, bounty ticket, challenge types)
src/app/(marketing)/        — public-facing pages (empty, ready for you)
src/app/(app)/              — authenticated app pages: problems, dashboard (empty, ready for you)
src/app/api/                — API routes: problems, submissions, escrow (empty, ready for you)
```

## Design tokens

Ink-navy background (`#0B0F1A`) with an electric lime accent (`#C4F135`) reserved for
CTAs and active states, and amber (`#FFB020`) reserved exclusively for money/escrow states.
Type: Inter (body) + IBM Plex Mono (numbers, bounty amounts, tags) — see `src/app/globals.css`
for the full token list and `src/app/layout.tsx` for font setup.

## What's NOT built yet (by design — v1 scope decisions)

- No code execution sandbox — submissions are manually reviewed by the problem-giver.
  `src/lib/evaluation/` has a stub interface ready for an LLM-assisted first pass later.
- Whop provider methods are unimplemented stubs (`src/lib/payments/whop-provider.ts`) —
  wire up the actual Whop SDK calls there. NOTE: Whop is built around creator subscriptions/
  purchases, not generic third-party payouts — you'll likely need a manual/batched payout
  flow for solvers until Stripe Connect replaces this.
- No auth wired up yet — recommend Supabase Auth, integrate in src/app/(app)/ layout.
- Badge-awarding logic (checking criteria, assigning UserBadge) not implemented —
  schema supports it, logic goes in a new src/lib/badges/ module.
- Rating/accuracy calculation not implemented — same, schema is ready.

## Critical invariant — read before touching escrow code

`Submission.isRevealed` must ONLY ever be set to `true` inside
`src/lib/escrow/release.ts`, as a side effect of a successful payout. This is
the entire trust guarantee of the platform (giver can't see full code until
they've actually paid). Never set it from a client request, an admin panel
shortcut, or any other code path without going through that function.
