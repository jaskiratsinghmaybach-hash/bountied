# Bounty Creation Flow — Rebuild Spec (v2 — corrected taxonomy)

**Audience:** Cursor (implementer). Read end to end before touching code.
I'm the planner/spec-writer; you implement. This supersedes any earlier
version of this doc — the language taxonomy below is a structural rework,
not a patch.

**Scope:** Replace `src/components/problems/new-bounty-form.tsx` entirely
with a single-page flow: a sequential-reveal pill phase (Bounty type →
Language → Scope) that transitions into a structured problem-builder
workspace (§13) for everything after Scope. One URL, one `<form>`, one
component tree throughout — never a route change. Backend (server actions,
escrow, sandbox execution) is touched minimally — see §7 and §13.6.

---

## 1. The interaction model (unchanged from v1 — restated for completeness)

Think Linear's issue creation or Notion AI's inline prompts — not a form,
not a wizard with Next/Back buttons and a progress bar.

- One question is "live" at a time. Answered questions collapse into a
  compact summary row above; the next question fades/slides in below.
- Answers are picked via **pills** wherever the answer set is enumerable.
  Free text (title, description) stays as real inputs, styled to match the
  same reveal rhythm.
- No page navigation, no route change, no modal stack. One `<form>`, one
  component tree, client state drives visibility.
- Motion: reuse `framer-motion` house style already in the codebase
  (`hero.tsx`, `role-selector.tsx`, `bounty-ticket.tsx` — fade + slight
  y-offset, ~0.3-0.4s, `ease: [0.16, 1, 0.3, 1]`).
- Selected pills get filled/accent treatment; unselected stay outlined.
  Single-select pills behave like radio buttons; multi-select show a
  checkmark/fill and allow toggling multiple.
- Every step remains editable after the fact — clicking a collapsed summary
  row re-expands that step without discarding later answers. State is a
  flat object, not a linked commit chain.

## 2. Corrected structural model — READ THIS CAREFULLY

This is the part that changed from the first draft. The hierarchy is now
**three layers deep**, not two:

```
LAYER 1 — Language (25 pills, shown on first screen)
   ↓ pick one
LAYER 2 — Scope (5 pills: 4 tailored to that language + 1 "Custom")
   ↓ pick one
LAYER 3 — Addons (multi-select pills, filtered by Language, sometimes
          further filtered/reordered by Scope — see §5)
```

**Layer 1 — Language.** The 25 pills are the real top-level identity of the
bounty: what language/runtime the solver will actually write code in. This
is what eventually maps to an E2B sandbox template (§8). Every pill is
visible; only Python is clickable today, the rest are greyed with a
tooltip ("Coming soon — join the waitlist").

**Layer 2 — Scope.** Once a language is picked, exactly **5 pills** appear:
4 fixed, tailored, language-specific categories that describe *what kind of
problem this is within that language* — plus a 5th pill, always labeled
"Custom", which reveals a free-text field for anything the 4 presets don't
cover. This is NOT reused across languages — Python's 4 scope pills are
meaningfully different from Swift's, which are different from Solidity's.
Full set is in §4.

**Layer 3 — Addons.** A separate concept from scope. Addons are the
*extra tools/technologies* layered on top of a language+scope combination —
things like PostgreSQL, Redis, Docker, Stripe API. Per your note: an addon
like SQL is deliberately NOT folded into the language list, because it's
usually a companion to something else, but it's built with room to promote
any addon into a full Layer-1 language pill later if it earns that status
(e.g. if SQL-only bounties become common enough, it graduates). Addons are
multi-select, filtered by Language, and every addon pill is disabled today
except where explicitly noted.

**Why this is right and the earlier "24+1 custom" draft was wrong:** you
want 25 *real* top-level languages on screen one, full stop — no custom
baked into that count. Custom exists at Layer 2 (per-language) and
implicitly at Layer 3 (the "+ Other" pill at the end of every addon set),
not as a 25th consumed slot in Layer 1.

## 3. Layer 1 — the 25 language pills

Grouped into visual sections purely for on-screen scannability — this
grouping is cosmetic only, it does NOT gate anything downstream:

**Web & Full-Stack:** JavaScript, TypeScript, React, Next.js, Node.js, PHP
**Systems & Backend:** Python *(enabled)*, Go, Rust, Java, C#, C++, C
**Mobile & Cross-Platform:** Swift, Kotlin, Dart/Flutter, React Native
**Data, Scripting & Other:** SQL, Ruby, Bash/Shell, Solidity, R, Scala,
Elixir, MATLAB

That's 6 + 7 + 4 + 8 = 25. Only `python` has `enabled: true`. All others
`enabled: false`, fully visible, disabled pill styling + tooltip.

## 4. Layer 2 — scope pills, tailored per language (the 25×4 matrix)

This is the real research deliverable. Each language gets exactly 4 fixed
scope pills reflecting how that language is *actually* used in practice,
plus every language automatically also gets a 5th "Custom" pill (not
listed again below — assume it on every row).

```
python:        Data Analysis · Machine Learning / AI · Web Backend
               (Django/FastAPI/Flask) · Automation & Scripting

javascript:    Frontend / DOM · Browser Extensions · Automation & Tooling
               (build scripts, CLIs) · Node Backend

typescript:    Frontend (typed) · Full-Stack (Next.js-style) · Backend API
               · Type/Tooling Infra (SDKs, type defs, linters)

react:         UI Components & State Bugs · Performance (re-renders,
               bundle size) · Forms & Data Fetching · Design System /
               Component Library

nextjs:        SSR / Routing / App Router · API Routes & Server Actions ·
               Auth & Middleware · Deployment/Build Issues (Vercel-class)

nodejs:        REST/GraphQL APIs · Real-time (WebSockets, SSE) · CLI Tools
               & Scripts · Background Jobs / Queues

php:           WordPress · Laravel Apps · Legacy/Vanilla PHP Maintenance ·
               E-commerce (WooCommerce/Magento-class)

go:            Microservices / APIs · CLI Tools · Concurrency / Goroutine
               Bugs · Cloud-Native (Kubernetes/Docker tooling)

rust:          Systems / Performance-Critical · WebAssembly · CLI Tools ·
               Blockchain / Web3 Infra

java:          Enterprise Backend (Spring) · Android (legacy Java) ·
               Concurrency & Threading · Build/Dependency Issues
               (Maven/Gradle)

csharp:        .NET Web (ASP.NET Core) · Desktop (WPF/WinForms/MAUI) ·
               Unity Game Dev · Enterprise/Azure Integration

cpp:           Performance / Systems Programming · Game Dev (engines) ·
               Embedded / Firmware · Graphics (OpenGL/Vulkan/DirectX)

c:             Embedded / Firmware · OS / Kernel-Level · Memory & Pointer
               Bugs · Legacy System Maintenance

swift:         iOS Apps · macOS Apps · Server-Side (Vapor) · watchOS/tvOS

kotlin:        Android Apps · Jetpack Compose UI · Backend (Ktor/Spring) ·
               Multiplatform (KMP)

dart:          Flutter UI · State Management (Bloc/Riverpod/Provider) ·
               Platform Channels (native bridge) · Performance/Animation

reactnative:   UI/Navigation · Native Module Bridging · Performance
               (bridge lag, list rendering) · Expo/Build Config

sql:           Query Performance / Indexing · Schema Design · Data
               Migration · Reporting/Analytics Queries

ruby:          Ruby on Rails Apps · API/Backend · Background Jobs
               (Sidekiq) · Legacy Rails Maintenance

bash:          Shell Scripts & Automation · CI/CD Pipeline Scripts ·
               System Administration · Cron/Ops Tooling

solidity:      Smart Contract Bugs · Gas Optimization · Security Audit /
               Vulnerability Fix · DeFi Protocol Logic

r:             Statistical Analysis · Data Visualization · Bioinformatics
               / Scientific Computing · Shiny Dashboards

scala:         Spark / Big Data Pipelines · Backend (Akka/Play) ·
               Functional Programming Bugs · Concurrency

elixir:        Phoenix Web Apps · Real-Time/Channels (chat, live features)
               · OTP/GenServer & Fault Tolerance · Background Jobs

matlab:        Signal Processing · Numerical/Scientific Computing ·
               Simulink Modeling · Data Visualization
```

Every one of the above rows implicitly ends with a 5th "Custom" pill —
don't hardcode it per-language in the data structure, derive it
automatically when rendering (see §6 data shape: `SCOPE_MATRIX` only needs
4 entries per language key; the UI layer always appends Custom).

## 5. Layer 3 — addons

Same underlying idea as before, kept mostly intact, but now explicitly
understood as sitting *after* scope selection, not replacing it. Addons
remain **filtered by language only** (not further split by scope — that
would be a 25×4×N matrix, disproportionate effort for a fully-disabled
placeholder layer right now). If certain addons only make sense for
certain scopes within a language, that's a Phase 2 refinement once real
execution exists — flag it, don't build it now.

```
python:        Django, FastAPI, Flask, SQLAlchemy, Pandas, NumPy, PyTorch,
               TensorFlow, scikit-learn, Celery, pytest, PostgreSQL, Redis,
               Docker
javascript:    Express, Fastify, React, Vue, jQuery, PostgreSQL, MongoDB,
               Redis, Jest, Docker
typescript:    Next.js, NestJS, Prisma, tRPC, React, Vue, Zod, PostgreSQL,
               Docker
react:         Next.js, Redux, Zustand, TanStack Query, Tailwind CSS,
               shadcn/ui, Vite
nextjs:        React, Prisma, Tailwind CSS, Vercel AI SDK, tRPC, Supabase
nodejs:        Express, Fastify, NestJS, PostgreSQL, MongoDB, Redis, Docker,
               GraphQL
php:           Laravel, Symfony, WordPress, MySQL, Composer
go:            Gin, Echo, gRPC, PostgreSQL, Docker, Kubernetes
rust:          Actix, Axum, Tokio, WebAssembly, Cargo
java:          Spring Boot, Hibernate, Maven, Gradle, Kafka, PostgreSQL
csharp:        ASP.NET Core, Entity Framework, Blazor, .NET MAUI, SQL Server
cpp:           Qt, Boost, CMake, OpenGL, CUDA
c:             POSIX, Embedded/Firmware toolchains, Make, CMake
swift:         SwiftUI, UIKit, Combine, CoreData, Vapor, Xcode
kotlin:        Jetpack Compose, Ktor, Android SDK, Coroutines
dart:          Flutter, Firebase, Riverpod, Bloc
reactnative:   Expo, React Navigation, Redux, Firebase
sql:           PostgreSQL, MySQL, SQLite, SQL Server, BigQuery, Snowflake
ruby:          Ruby on Rails, RSpec, Sidekiq, PostgreSQL
bash:          Linux/Unix, Docker, CI/CD scripting, Cron
solidity:      Hardhat, Foundry, OpenZeppelin, Ethers.js, Web3.js
r:             tidyverse, ggplot2, Shiny, RStudio
scala:         Akka, Play Framework, Spark, sbt
elixir:        Phoenix, Ecto, OTP/GenServer
matlab:        Simulink, Signal Processing Toolbox, Deep Learning Toolbox
```

Every language's addon list ends with a rendered "+ Other (specify)" pill
(not stored in the data table — same pattern as the scope layer's implicit
Custom pill). That's the "worst case, give the giver Custom" fallback,
present at both Layer 2 and Layer 3.

**On promoting an addon to a language:** don't build any actual promotion
mechanism now. Just make sure `language` and `addons` are stored as plain
strings/string-arrays (§7), not as a hardcoded enum — that's what keeps
"SQL becomes its own language pill later" a config change instead of a
migration.

## 6. Data shape

```ts
// One row per language. Order = display order within its cosmetic section.
type LanguageDef = {
  id: string;             // "python", "cpp", "reactnative", etc.
  label: string;
  section: "web" | "systems" | "mobile" | "data";  // cosmetic grouping only
  enabled: boolean;       // true only for "python" right now
};

// Exactly 4 tailored entries per language id — Custom is appended by the
// component, never stored here.
type ScopeDef = { id: string; label: string; enabled: boolean };
const SCOPE_MATRIX: Record<string, ScopeDef[]> = { python: [/* 4 items */], /* ... */ };

// Addon pills per language id. "+ Other" appended by the component.
type AddonDef = { id: string; label: string; enabled: boolean };
const ADDON_MATRIX: Record<string, AddonDef[]> = { python: [/* ... */], /* ... */ };
```

**Enabled-state inheritance (authoritative):** A pill's `enabled` state is
inherited from its parent chain. Layer 1 Language pills: only `python` is
`enabled: true`; the other 24 are disabled with the "Coming soon — join the
waitlist" tooltip. For the 24 disabled languages, their Scope and Addon
pills are unreachable (moot). Once the giver picks **Python**, everything
downstream — all 4 Scope pills + Custom, and all `ADDON_MATRIX["python"]`
entries + "+ Other" in the workspace — is **enabled and selectable**. Do
not disable Scope/Addon pills under an enabled Language; that would dead-end
the flow. In data files, `ScopeDef`/`AddonDef` may still carry
`enabled: true` for Python's subtree; non-Python matrix entries only matter
when those languages are eventually enabled at Layer 1.

## 7. Data model changes (Prisma)

Three new pieces of metadata, all display/matching data — NOT the same as
`Problem.runtime`/`runCommand`, which govern actual sandbox execution and
stay Python-only until real templates exist per §8.

- `Problem.language: String?` — Layer 1 pill id (e.g. `"python"`).
  Defaults `"python"` on submit today since that's the only enabled path.
- `Problem.scope: String?` — Layer 2 pill id (e.g. `"ml"`,
  `"web_backend"`), or the free-text value if the giver picked that
  language's Custom scope pill.
- `Problem.addons: String[]` — Layer 3 selections, default `[]`. May
  contain addon ids and/or free-text "+ Other" entries in the same array.

Server-side guard in `src/lib/problems/create-actions.ts`: reject any
submission where `language !== "python"` with a clear "not open yet, join
the waitlist" error — the UI already prevents selecting disabled pills, but
never trust client-only enforcement. This is the one new validation branch;
everything else in `parseFields()`/`createProblem`/`updateProblem` is
unchanged (fee math, draft/publish intent, funding flow all untouched).

New migration: `prisma/migrations/<timestamp>_add_problem_language_scope_addons/migration.sql`,
following existing migration file conventions in the repo.

## 8. Sandbox master templates — noted for planning, NOT built in this pass

You flagged that when real language support gets added, each language needs
its own **master E2B template** with every common dependency/library/module
pre-baked in, rather than a bare interpreter — otherwise any solver
submission needing a library the template doesn't have fails outright, which
is a bad experience for something that should just be "does the code work."

This directly affects how `src/lib/sandbox/runtimes.ts`'s `RUNTIME_REGISTRY`
should grow: today it's `{ PYTHON: { templateId, dependencyFileName:
"requirements.txt", installCommand: pip install -r ... } }`. The existing
design (install step conditional on a dependency manifest file being
present) already fits a master-template model — a rich base image plus a
manifest-triggered install step for anything extra a specific submission
needs on top of the baked-in set. When each new language's template gets
built, follow that same pattern: master image with the language's
most-common libraries/frameworks pre-installed (informed directly by
whatever that language's §5 addon list turned out to be — that list is
effectively the pre-install shopping list per language), plus the existing
manifest-triggered install step as the fallback for anything not baked in.

**Action for this pass:** none beyond leaving a comment in
`runtimes.ts` pointing future-you at this doc's §8 for context. Do not
start building additional templates now — this is purely so the eventual
work has a clear on-ramp instead of getting rediscovered from scratch.

## 9. Desktop app (Tauri) for secure submission review — noted, NOT built now

Also flagged for planning only, zero implementation in this pass: once
languages beyond Python produce real frontend/UI output (not just captured
stdout/stderr text), rendering that output in a normal browser tab is a
security problem — a giver's browser can screenshot, inspect-element, or
otherwise exfiltrate a solver's UI/source before payment has actually
gated access to it, which breaks the same reveal-gate guarantee that
`lib/escrow/release.ts` and the private-mirror-repo system already protect
carefully on the code side.

The plan: a **Tauri desktop app** that renders sandbox output over a
locked-down channel (WebRTC + custom protocol, no screenshot/capture
surface) instead of a browser tab, gated by the same web session —
solver/giver auths in-browser as today, and the desktop app either shares
that session (token handoff) or does its own OAuth pass tied back to the
same Supabase user, then only surfaces reviews the authenticated user is
entitled to see (their own problems' submissions, or their own submitted
work).

**Action for this pass:** none. This is architecturally downstream of (a)
having non-Python runtimes that produce visual output at all, and (b) this
bounty-creation flow existing to even collect `language`/`scope` metadata
in the first place. No code, no scaffolding — noting it here so the
`language`/`scope`/`addons` fields land with names and shapes that will
still make sense when that work starts (e.g. don't call the field
`pythonExtras` or anything runtime-specific).

## 10. Component structure to build

```
src/components/problems/bounty-flow/
  bounty-flow.tsx        — orchestrator, owns state, renders steps in
                            order, handles submit
  flow-step.tsx           — shared collapse/expand wrapper
  step-bounty-type.tsx    — existing 4 bounty types (OPEN_BOUNTY etc.),
                            unchanged copy from current new-bounty-form.tsx
  step-language.tsx       — Layer 1, all 25 pills grouped into the 4
                            cosmetic sections from §3
  step-scope.tsx          — Layer 2, reads SCOPE_MATRIX[language], renders
                            4 tailored pills + auto-appended Custom pill
                            (Custom reveals inline free-text)
  step-addons.tsx         — Layer 3, reads ADDON_MATRIX[language],
                            multi-select + auto-appended "+ Other" pill
  step-title.tsx
  step-description.tsx
  step-tags.tsx
  step-deadline.tsx        — preset pills (No deadline/1w/2w/1mo/Custom)
  step-run-command.tsx
  step-bounty-amount.tsx   — reuse existing fee-breakdown logic near-verbatim
  step-review.tsx          — final summary, both submit buttons
  pill.tsx                 — shared <Pill> primitive incl. disabled+tooltip
```

State shape in `bounty-flow.tsx`:

```ts
type BountyFlowState = {
  currentStepIndex: number;
  type: ProblemType | null;
  language: string | null;        // Layer 1 id
  scope: string | null;           // Layer 2 id, or "custom"
  customScope: string;            // free text if scope === "custom"
  addons: string[];               // Layer 3 ids + free-text "other" entries
  title: string;
  description: string;
  tags: string;                   // comma-separated, matches parseFields()
  deadlinePreset: "none" | "1w" | "2w" | "1m" | "custom" | null;
  deadlineCustom: string;
  runCommand: string;
  bountyAmount: string;
};
```

Step order: Bounty type → Language → Scope → Addons → Title → Description
→ Tags → Deadline → Run command → Bounty amount (skipped if
`type === "OPEN_FREE"`) → Review.

On submit: translate to the `FormData` shape `createProblem`/`updateProblem`
already expect, plus `language`, `scope`, `addons` (JSON-stringify the
addons array into one hidden field, or extend `parseFields()` to read
`addons[]` multiple entries — Cursor's call on whichever is cleaner given
how `parseFields()` is structured today).

Editing (`existingProblem` prop, from
`src/app/(app)/dashboard/giver/problems/[id]/edit/page.tsx`): pre-fill
`BountyFlowState`, land on the review step with all prior steps marked
answered/collapsed, but still individually re-openable.

## 11. What NOT to change in this pass

- `src/lib/problems/create-actions.ts` — only the language-guard branch +
  reading the 3 new fields. Fee math, draft/publish branching,
  `retryFundDraft` all untouched.
- `src/lib/payments/*`, `src/lib/escrow/*`, `src/lib/sandbox/*` —
  untouched, except the single planning-comment noted in §8.
- `InsufficientCreditsModal` — untouched.
- `src/app/(app)/problems/new/page.tsx` / `edit/page.tsx` — only the import
  swap from `NewBountyForm` to the new flow component.
- No Tauri work, no new E2B templates. §8/§9 are context, not tasks.

## 12. Build order

**Pill phase first:**
1. `pill.tsx` primitive — visual language, disabled+tooltip state.
2. `flow-step.tsx` — collapse/expand animation with placeholder content.
3. `step-bounty-type.tsx` + `step-language.tsx` — prove the single-select
   pill pattern end to end, including the 25-pill grouped layout.
4. `step-scope.tsx` — prove the "filtered-by-prior-answer, 4+Custom"
   pattern. This is the trickiest step in the pill phase; get it right
   before moving on.

**Then the workspace (§13), in this order:**
5. Schema migration — do this before building workspace UI, since every
   workspace field needs somewhere real to persist to (combine §7's
   `language`/`scope`/`addons` columns and §13.6's
   `referenceRepoUrls`/`screenshotUrls`/`logs` columns into one migration).
6. `workspace-layout.tsx` — the layoutMode transition + Tier 1/2/3 grid
   skeleton, with placeholder content in each tier, before wiring real
   fields in. Confirm the pills→workspace transition animation feels right
   before building inside it.
7. `field-description.tsx` (the 3-box Tier 1 cluster) — highest-value
   field, build it first among the workspace fields.
8. `field-repos.tsx` — wraps existing `repo-selector.tsx`; confirm reuse
   works cleanly before building the remaining Tier 2 fields.
9. `field-screenshots.tsx`, `field-logs.tsx` — Tier 2 remainder. Flag back
   before building screenshot storage if no existing upload pattern is
   found in the codebase (§13.2).
10. `addons-section.tsx` (Layer 3, now living in the workspace per §13.5)
    + Tier 3 remaining fields (tags, deadline, run command, bounty amount
    — mostly porting existing form fields).
11. `save-status-indicator.tsx` + debounced auto-save wiring (§13.4).
12. `bounty-flow.tsx` orchestrator tying pill phase + workspace phase
    together, plus the final submit handler with 13.3's publish-time
    validation.
13. `create-actions.ts` changes: language guard (§7) + mandatory-field
    validation on publish intent only (§13.6) + auto-save action.
14. Wire into `new/page.tsx` and `edit/page.tsx` (including drafts
    hydrating the workspace correctly per §13.4), delete
    `new-bounty-form.tsx`.

Flag anything that turns out awkward once you're actually in the code —
particularly if `parseFields()`'s current structure fights the new fields,
or if no existing screenshot/asset storage pattern exists — rather than
silently improvising around it.

---

## 13. The problem-builder workspace (post-Scope) — READ THIS CAREFULLY

Everything in §1–§12 covers the pill-driven selector phase: Bounty type →
Language → Scope → Addons. This section covers what happens **after** Scope
is picked — the actual substantive work of specifying the bounty. This is
not another pill step. It's a different, larger interface that the flow
transitions into. Get this right; it's the part that actually matters to
whether a solver can do anything useful with the bounty.

### 13.1 The layout transition

Once Scope is answered (Addons can still be picked inside the workspace —
see 13.4), the screen changes **layout mode**, not URL. Concretely:

- All prior answers (Bounty type, Language, Scope) collapse from full pill
  rows into a single **sticky summary strip** pinned to the top of the
  workspace — small pills/tags, still clickable to jump back and change an
  earlier answer (existing "re-expand" behavior from §1 still applies, it
  just now re-collapses the workspace below it rather than pushing new
  steps below).
- Below that strip, the screen shifts from "one thing stacked below the
  last" into a **structured workspace grid** — this is a real change in
  `layoutMode` state (`"pills" | "workspace"`), not a visual accident.
  Think: the difference between a chat-style onboarding and a real editor
  screen (e.g. Linear's issue detail view, or GitHub's "New Issue" form
  once you're past the template picker) — title/description dominate the
  main column, supporting material (repos, screenshots, logs, addons) sits
  in organized sections around/below it.
- This is still the exact same URL, the exact same `<form>`, the exact same
  top-level React tree and `BountyFlowState` object driving everything —
  `layoutMode` is just one more field in that same state. No route change,
  no new page, no modal. The transition itself (pills → workspace) should
  be animated with the same Framer Motion house style as every other
  transition in this flow (§1) — a cross-fade/layout-shift, not a hard cut.

### 13.2 Workspace structure — what's actually in it

The workspace has clear visual hierarchy, not a flat list of equally-weighted
boxes. Structure it as three tiers:

**Tier 1 — Primary spec (main column, always visible, largest):**
- **Title** (already existed as a step — moves here as the workspace's
  header field, not a separate pill step anymore; see 13.5 for how this
  changes the step sequence)
- **Description** — what's wrong / the problem, in the giver's own words
- **What's broken / needs fixing** — a distinct field from Description,
  not the same box. Description can be the general framing ("our
  WebSocket reconnect logic drops messages under load"); this field is
  specifically "here's what's currently happening that's wrong" — the
  symptom/bug.
- **Desired output / what a correct solution looks like** — also distinct.
  This is the acceptance criteria in the giver's words — what a solver's
  fix should actually produce/do once correct. Bounties without this are
  exactly the ones that end in disputes ("I fixed it, why won't you pay"),
  so this is deliberately a first-class field, not a throwaway line buried
  in Description.

These three text fields (Description, What's broken, Desired output)
replace the current single `description` textarea. They can still all
map to the *same* underlying `Problem.description` DB column — concatenate
them with clear section headers when persisting (e.g. `## Problem\n...\n##
What's broken\n...\n## Desired output\n...`) rather than adding 3 new DB
columns for this pass. Keep the display/edit-time structure (3 separate
boxes in the UI) even though storage stays a single text blob — this
avoids a schema change for something that's fundamentally still "the
problem description," just guided into better shape.

**Tier 2 — Reference material (secondary section, still prominent):**
- **GitHub repositories** — up to 3, reusing the existing
  `repo-selector.tsx` component (OAuth-based picker, same pattern already
  used for solver submissions) reused here for the **giver** side: repos
  the giver wants the solver to reference/work against (their actual
  project repo, a repo showing the bug, etc.) — NOT the same thing as a
  solver's submission repo, don't conflate these two concepts anywhere in
  naming (see 13.6 for the exact new DB field).
- **Screenshots** — image upload, multiple allowed, optional. Standard
  file input + preview thumbnails; store via whatever asset storage
  pattern already exists in the codebase for image handling (check if one
  exists before inventing a new one — if none exists yet, flag it back
  rather than silently picking an approach, since this needs real storage,
  not a placeholder).
- **Logs** — plain textarea or file upload (support both: paste raw log
  text directly, OR upload a `.txt`/`.log` file) — optional.

**Tier 3 — Addons (from Layer 3, §5) + remaining metadata:**
- **Addons** — this is where Layer 3 actually lives in practice, not as
  its own pill-step screen. Once the giver is in the workspace, addons
  render as a compact multi-select pill cluster (filtered by the chosen
  Language per §5's `ADDON_MATRIX`) inside this tier — e.g. a Python
  bounty scoped to "Web Backend" shows Django/FastAPI/Flask/SQLAlchemy/
  PostgreSQL/etc. pills right here, not on a separate screen the user
  already passed through. This resolves your "he should come somewhere,
  and at that place there will be the option of addons" instruction
  directly — addons live IN the workspace, not as their own step before it.
- **Tags** (existing field, ported in as-is)
- **Deadline** (existing field, ported in as-is — preset pills per §10)
- **Run command** (existing field — still required, still Python-only
  validated per §7)
- **Bounty amount** (existing field, skipped if type is `OPEN_FREE`)

### 13.3 Mandatory vs. optional — enforced at publish, not at draft

This is explicit now, not vague:

**Required to publish (fund & post) — blocks submission with inline
validation if missing:**
- Description
- What's broken / needs fixing
- Desired output / what a correct solution looks like
- At least 1 GitHub repository attached
- Bounty type, Language, Scope, Title, Run command (already-required fields
  from the existing flow, carried forward)
- Bounty amount (if not `OPEN_FREE`)

**Optional, always:**
- Screenshots
- Logs
- Addons
- Tags
- Deadline

**Draft saves ignore all of the above** — a draft can be in any partial
state, per 13.4. Validation only fires on the "Fund & post bounty" /
"Post bounty" (free) action, same as today's `parseFields()` validation
pattern in `create-actions.ts` — extend that function's checks rather than
building a second validation path.

### 13.4 Auto-save / draft behavior

- Debounced auto-save: after ~2–3s of no changes to any workspace field,
  silently persist the current state as a `DRAFT` problem via a new server
  action (or by extending the existing `createProblem`/`updateProblem`
  actions — see 13.6), no visible button, no toast spam. A small, subtle
  "Saved" / "Saving…" indicator near the summary strip is fine (reuse
  whatever subtle-status-text pattern exists elsewhere, e.g. how
  `add-credits-widget.tsx` shows phase text) — but this must never block
  or interrupt typing.
- First auto-save creates the DRAFT `Problem` row (same as clicking "Save
  as draft" does today) and captures its id into `BountyFlowState`
  (`draftProblemId: string | null`); every subsequent auto-save is an
  update against that same id, not a new row each time.
- If the user reloads the page or comes back later via
  `/dashboard/giver/problems/[id]/edit`, the workspace should hydrate from
  that saved draft exactly like the existing edit flow already does
  (§10's `existingProblem` prop / pre-fill behavior) — auto-save and the
  existing draft-edit system are the same underlying mechanism, just
  triggered automatically instead of manually.
- Debounce implementation: standard `useEffect` + `setTimeout`/clear
  pattern, or a small debounce hook if the codebase already has one
  (check `src/lib/utils.ts` and existing hooks before adding a new
  dependency for this — it's a small enough utility it shouldn't need one).

### 13.5 Updated step sequence

Supersedes the sequence given in §10. The pill-phase steps stay the same
up through Scope; everything after that moves into the workspace instead
of being its own sequential pill step:

```
PILL PHASE (layoutMode: "pills", stacked reveal per §1):
  1. Bounty type
  2. Language
  3. Scope

WORKSPACE PHASE (layoutMode: "workspace", single structured screen,
  everything below visible together, no further sequential reveal —
  the giver can fill these in any order):
  Tier 1: Title, Description, What's broken, Desired output
  Tier 2: GitHub repos, Screenshots, Logs
  Tier 3: Addons, Tags, Deadline, Run command, Bounty amount
  Final: Review + submit (still the same two buttons — "Fund & post
    bounty" / "Save as draft" — pinned at the bottom of the workspace,
    always reachable, not a separate step)
```

Note Addons moved from being its own pill step (as originally drafted in
§10) into living inside the workspace per 13.2 Tier 3. Update
`step-addons.tsx`'s role accordingly (§13.6) — it's no longer a top-level
step component in the pill sequence, it's a section rendered inside the
workspace.

### 13.6 Component + data model additions

New components, under the same `bounty-flow/` directory:

```
src/components/problems/bounty-flow/
  workspace/
    workspace-layout.tsx     — the Tier 1/2/3 grid container, handles the
                               layoutMode transition animation
    field-description.tsx    — the 3-box Tier 1 text cluster (Description
                               / What's broken / Desired output)
    field-repos.tsx           — wraps existing repo-selector.tsx, capped
                               at 3 selections, giver-side variant
    field-screenshots.tsx     — image upload + thumbnail preview
    field-logs.tsx             — textarea + optional file upload
    addons-section.tsx         — Layer 3 pills, now rendered here instead
                               of as a standalone step (reuses
                               ADDON_MATRIX from §5/§6 unchanged)
    save-status-indicator.tsx  — small "Saving…/Saved" text
```

Data model — extends §7's additions, does not replace them:

- `Problem.description` — unchanged column, now stores the concatenated
  3-section text per 13.2's Tier 1 note.
- `Problem.referenceRepoUrls: String[]` — NEW. Up to 3 giver-attached
  reference repos (distinct from `Submission.repoUrl` /
  `Submission.platformRepoUrl`, which are solver-side and already exist —
  do not reuse or rename those fields, this is a parallel, separate
  concept living on `Problem`, not `Submission`).
- `Problem.screenshotUrls: String[]` — NEW, default `[]`. Requires actual
  asset storage — flag back if no existing upload/storage pattern is found
  in the codebase rather than inventing one silently (see 13.2).
- `Problem.logs: String?` — NEW, nullable text.
- `language`, `scope`, `addons` — unchanged from §7.

Extend the same migration file planned in §7
(`add_problem_language_scope_addons`) to include these 3 additional
columns too — one migration for this whole feature pass, not two.

`create-actions.ts` changes (extends §7, doesn't replace it):
- `parseFields()` gains validation for the new mandatory set from 13.3
  (Description/What's-broken/Desired-output presence, at least 1 repo)
  — but **only when `intent === "publish"`**, exactly like the existing
  language guard. Draft intent (`intent === "draft"`, including
  auto-save's implicit draft writes) skips this validation entirely,
  matching current behavior where drafts can be incomplete.
- New lightweight action (or extend `updateProblem`) for the debounced
  auto-save call — same DRAFT-only, owner-only checks the existing
  `updateProblem` already does, just callable without a full form
  submission event.

### 13.7 What NOT to change (extends §11)

- Solver-side submission flow (`submission-form.tsx`,
  `submission-actions.ts`, the sandbox mirroring/execution pipeline) is
  completely untouched by this section. The new `referenceRepoUrls` /
  `screenshotUrls` / `logs` fields are giver-authored context for solvers
  to read, never inputs to sandbox execution.
- `repo-selector.tsx` itself should not need logic changes — reused as-is
  for the giver side; if it currently has any submission-specific
  assumptions baked in (check its props/copy), extract those into a prop
  rather than forking the component.