# Review Engine architecture: removing arbitrary command execution

Status: **approved design, not yet implemented**. This document is the
complete spec for a fresh implementation chat to build from. Read this
whole file before writing any code — the ordering and reasoning matter,
not just the final shape.

## 1. The vulnerability (confirmed by direct code read, 2026-10-03)

`Problem.runCommand` is a free-text field a Giver types at bounty
creation (`components/problems/bounty-flow/workspace/field-run-command.tsx`
— a plain `<input>`, no content validation beyond non-empty). It is
stored as-is (`lib/problems/create-actions.ts`) and later executed
**verbatim, with no sanitization, inside the solver's cloned repo**:

```
// lib/sandbox/execute.ts
run = await sandbox.commands.run(runCommand, { cwd: workDir, ... });
```

`runCommand` comes from `submission.problem.runCommand`
(`app/api/sandbox/run/route.ts:37`) — the Giver's own field. The full
`stdout`/`stderr` of that command is stored in `Submission.sandboxOutput`
and rendered directly on the Giver's review page
(`giver-submission-card.tsx`), **before acceptance, before escrow
release, before the reveal gate**.

**Concretely:** a Giver can set `runCommand` to `cat $(find . -name
"*.py")`, or any shell one-liner that reads, greps, or archives the
solver's files, and receive the full output as a normal "sandbox ran
successfully" result. This defeats the entire pre-reveal source
protection the platform is built around (see `lib/escrow/release.ts`'s
reveal-gate design, which this bypasses entirely by never going through
it).

**Why "move it to the Solver instead" is not the fix:** the Solver is
also untrusted from the platform's perspective. The fix removes
arbitrary-command execution as a concept, for both sides — not just
relocates who writes the shell string.

## 2. Design principle

**No raw text supplied by a Giver or a Solver may ever reach a shell.**
The only commands that ever execute are ones the platform's own trusted
code constructs from structured, validated data. This is not a new
pattern for this codebase — `lib/sandbox/runtimes.ts`'s existing
`installCommand: (deps: ManifestDependency[]) => string` already works
this way: it takes structured data (a parsed dependency list) and
*builds* a command, rather than accepting one. The fix generalizes that
exact pattern to the run/test step.

```
Giver: declares evaluation REQUIREMENTS (what must be true), not a command
Solver: declares PROJECT METADATA in bountied.json (what their code is), not a command
Platform (Runtime Adapter): the ONLY thing that builds an actual command,
  from the two declarations above, using a fixed, per-runtime template
```

## 3. bountied.json: new fields

Extend `BountiedManifest` (`lib/sandbox/bountied-manifest.ts`) — a
Solver-authored, Giver-readable, platform-validated declaration of their
project. New fields, all optional (omitting them means the runtime
adapter falls back to a sensible per-runtime default):

```ts
export type BountiedManifest = {
  dependencies: ManifestDependency[];
  /** Relative path to the program's entry file, e.g. "main.py", "index.js". No shell metacharacters — validated as a plain relative path. */
  entrypoint?: string;
  /** How the solver's project should be evaluated. Maps to a fixed, per-runtime command TEMPLATE — never raw text. */
  executionMode?: "test" | "build-test" | "run";
};
```

- `"test"` → the runtime adapter runs ITS OWN fixed test-runner invocation
  (`pytest`, `npm test`) against the repo root. No entrypoint needed.
- `"build-test"` → adapter runs its fixed build step, then its fixed test
  step. (TypeScript/compiled-language groundwork; for Python/Node today
  this can be treated the same as `"test"` since neither has a separate
  mandatory build step — document this explicitly in the adapter, don't
  silently diverge behavior.)
- `"run"` → adapter runs `{runtimeBinary} {entrypoint}` using ITS OWN
  fixed invocation shape (`python {entrypoint}`, `node {entrypoint}`) —
  `entrypoint` is interpolated as a PATH ARGUMENT, never concatenated into
  a shell string the solver controls the rest of. Validate `entrypoint`
  against a strict pattern (e.g. `/^[\w./-]+$/`, reject `..`, reject
  leading `/`, reject anything containing `;`, `|`, `&`, backticks,
  `$(`) before it ever reaches `sandbox.commands.run`.
- No `executionMode` declared → adapter defaults to `"test"` if the
  runtime has a conventional test runner, else `"run"` with a
  per-runtime default entrypoint guess (`main.py`, `index.js`) — codify
  the default explicitly per runtime, do not leave it implicit.

**What a Giver declares at bounty creation** (replaces the free-text
`runCommand` field in the UI): NOT a command. A structured "evaluation
requirement" — for v1, this can be as simple as a single
`executionMode` picker (Test / Run) shown to the Giver, consistent with
what the Solver's manifest can declare, OR (simpler v1, recommended):
**the Giver's input is retired from execution entirely** — the runtime
adapter decides based solely on the Solver's `bountied.json`, and the
Giver's role becomes reviewing the resulting evidence, not configuring
how it's produced. Recommend starting with this simpler version; a
Giver-side evaluation-requirements UI can be layered on later without
another trust-model change.

## 4. Runtime Adapter: the only place commands are built

Extend `RuntimeConfig` in `lib/sandbox/runtimes.ts` — add one new
trusted builder function per runtime, directly alongside the existing
`installCommand` pattern:

```ts
export type RuntimeConfig = {
  // ...existing fields unchanged (templateId, installCommand, installRetry, etc.)...

  /**
   * Builds the actual evaluation command for this runtime from the
   * Solver's parsed, validated manifest. This is the ONLY function in
   * the whole system permitted to produce a string that reaches
   * sandbox.commands.run for the "evaluate the submission" step.
   * entrypoint has already been validated by the caller (strict path
   * pattern, no shell metacharacters) before this ever sees it —
   * treat that as a precondition, not something to re-validate here,
   * but never skip the caller-side validation either.
   */
  buildEvaluationCommand: (manifest: BountiedManifest) => string;
};
```

Example implementations (illustrative, not final — the implementation
chat should verify exact test-runner invocations):

```ts
// PYTHON
buildEvaluationCommand: (manifest) => {
  if (manifest.executionMode === "run") {
    const entry = manifest.entrypoint ?? "main.py";
    return `python ${entry}`; // entry already validated upstream
  }
  return "pytest"; // default: "test" mode, or unspecified
},

// NODE
buildEvaluationCommand: (manifest) => {
  if (manifest.executionMode === "run") {
    const entry = manifest.entrypoint ?? "index.js";
    return `node ${entry}`;
  }
  return "npm test"; // default
},
```

## 5. execute.ts changes

- Remove `runCommand: string` from `ExecuteSubmissionParams` (or
  whatever the current param name is — re-check at implementation
  time).
- Add `manifest: BountiedManifest` (already parsed earlier in the
  pipeline — `execute.ts` already parses `bountied.json` for the
  dependency-install step; reuse that same parse result rather than
  parsing twice).
- Replace `sandbox.commands.run(runCommand, ...)` with
  `sandbox.commands.run(getRuntimeConfig(runtime).buildEvaluationCommand(manifest), ...)`.
- The entrypoint path-validation (strict regex, reject traversal/shell
  metacharacters) belongs in `bountied-manifest.ts`'s parser
  (`parseBountiedManifest`) — treat an invalid entrypoint as a parse
  error, same severity as today's malformed-JSON handling, so it's
  rejected before any sandbox boots, not at execution time.

## 6. Review Evidence: what the Giver is allowed to see

This is the second half of the fix — even with commands locked down,
the review model should not implicitly promise "you'll see whatever the
command prints." Define this explicitly rather than leaving it as "the
historical sandboxOutput field, now fed from a safer command":

```ts
type ReviewEvidence = {
  exitCode: number | null;
  status: "passed" | "failed" | "error";
  /** Bounded — truncate, don't stream unbounded stdout/stderr. Cap TBD at implementation time (e.g. 10,000 chars), with a clear "output truncated" marker if hit. */
  output: string;
  /** Structured, when the runtime adapter can parse them — e.g. pytest's own summary line counts. Optional; falls back to raw output if a runtime has no structured parser yet. */
  testSummary?: { passed: number; failed: number; total: number };
};
```

`Submission.sandboxOutput`/`sandboxError`/`sandboxExitCode` can likely
stay as the storage columns (minimize schema churn) — the change is in
WHAT populates them (bounded, structured evidence from a fixed command,
never raw output from an arbitrary one) and in formalizing the shape
above as the actual contract the Giver's UI renders against, rather than
"whatever came back."

## 7. Schema / migration plan

- `Problem.runCommand` (`String`, required) — do not delete outright.
  Plan:
  1. Make it nullable in a migration (`String?`).
  2. Stop writing to it from `create-actions.ts` / the bounty-creation
     UI (remove `FieldRunCommand` from the form, or repurpose it as a
     read-only display of the Solver's declared entrypoint later).
  3. Stop reading it in `execute.ts` / `api/sandbox/run/route.ts`
     (replaced by the runtime adapter path above).
  4. Leave existing rows' historical values in place (harmless once
     nothing reads them) rather than backfilling/deleting — this is
     data about past bounties, not a live security surface once step 3
     lands.
  5. A later cleanup migration can drop the column entirely once
     confirmed nothing references it — do not do this in the same pass
     as the security fix itself; keep the urgent fix and the cleanup
     separate.

## 8. Everything that touches the removed surface — audit list

Confirmed via `grep -rln "runCommand"` (2026-10-03), re-check at
implementation time in case more changed since:

- `components/problems/bounty-flow/workspace/field-run-command.tsx` —
  the UI input itself; remove or repurpose per §7.
- `components/problems/bounty-flow/bounty-flow.tsx` — wires the field
  into the form; remove the wiring.
- `lib/problems/create-actions.ts` — stores it on create/update; stop
  writing it (or keep writing a deprecated/unused value if removing the
  UI entirely is out of scope for the first pass — prefer removing the
  UI).
- `lib/problems/manifest-template.ts` — check if this references
  `runCommand` when generating the Solver-facing `bountied.json`
  skeleton/prompt; if so, that's the right place to instead document
  `entrypoint`/`executionMode` as the fields to fill in.
- `lib/sandbox/execute.ts` — the actual execution; see §5.
- `lib/sandbox/runtimes.ts` — add `buildEvaluationCommand`; see §4.
- `app/api/sandbox/run/route.ts` — stop passing `runCommand` through;
  pass the parsed manifest instead.
- `app/(app)/dashboard/giver/problems/[id]/edit/page.tsx`,
  `app/(app)/dashboard/giver/problems/[id]/page.tsx`,
  `app/(app)/problems/[id]/page.tsx` — anywhere `runCommand` is
  displayed to a Giver or Solver; remove or repurpose per §7.

## 9. What this fix does NOT change

- E2B isolation itself — already correctly used; this fix is about what
  COMMAND runs inside that isolation, not the isolation boundary.
- The escrow/reveal gate (`lib/escrow/release.ts`) — already correct,
  already the sole authority on source access; this fix closes a path
  that bypassed it, it doesn't change the gate itself.
- `bountied.json`'s dependency-install step — unaffected; that's
  already a trusted-builder pattern (`installCommand`) and was never
  part of this vulnerability.
- Multi-runtime, resubmission, notifications, grouped-UI work from
  earlier this session — unaffected, orthogonal to this fix.

## 10. Order of work for the implementation chat

1. Add `entrypoint`/`executionMode` to `BountiedManifest` +
   `parseBountiedManifest` (with strict entrypoint validation) in
   `lib/sandbox/bountied-manifest.ts`.
2. Add `buildEvaluationCommand` to every `RuntimeConfig` entry in
   `lib/sandbox/runtimes.ts` (Python, Node).
3. Update `execute.ts` to use it instead of raw `runCommand`.
4. Update `api/sandbox/run/route.ts` to stop passing `runCommand`.
5. Remove/repurpose the Giver-facing run-command UI (§8's component
   list).
6. Schema migration: `Problem.runCommand` → nullable (§7, step 1 only
   — do not drop the column yet).
7. Update `lib/problems/manifest-template.ts`'s generated
   skeleton/prompt to describe `entrypoint`/`executionMode` instead of
   (or alongside) whatever it currently tells a Solver about
   `runCommand`.
8. Test end-to-end on both Python and Node with a real submission
   before calling this done — this is exactly the kind of change where
   a quiet failure (adapter builds a malformed command, execution
   silently no-ops) is worse than a loud one.
9. Only after 1–8 are verified working: plan the column-drop cleanup
   migration as a separate, later change.
