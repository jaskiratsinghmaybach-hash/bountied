/**
 * Generates the STANDARD bountied.json skeleton for a Problem's language,
 * and the copy-paste prompt that tells a Solver's AI coding assistant how
 * to fill it in.
 *
 * Product decision 2026-09-27: the schema is platform-defined and fixed —
 * an AI coding assistant fills in VALUES against this skeleton, it never
 * invents new top-level keys or a different shape. This is what keeps
 * bountied.json a regulated, parseable contract instead of N different
 * ad-hoc manifests that happen to share a file name. The signal for which
 * skeleton to generate is Problem.language (set by the Giver at bounty
 * creation via StepLanguage — see components/problems/bounty-flow/
 * step-language.tsx) — not a guess from the bounty description text. A
 * Giver's language selection is a deliberate, structured choice; parsing
 * free-text descriptions to infer the same thing would be strictly less
 * reliable for zero benefit, since the field already exists.
 *
 * This module only owns the SKELETON (runtime block, empty dependencies,
 * standard keys) and the PROMPT TEXT. Parsing/validating what the Solver's
 * AI actually fills in — including enforcing the Giver's optional
 * dependencyPolicy — stays in lib/sandbox/bountied-manifest.ts; this module
 * never parses a solver-submitted bountied.json, only ever produces the
 * starting point for one.
 */

import { getLanguageDef, getScopeDef } from "@/components/problems/bounty-flow/flow-data";

/**
 * The standard bountied.json shape every language skeleton follows.
 * Deliberately small (per product decision 2026-09-26 — see
 * lib/sandbox/bountied-manifest.ts's doc comment on why the schema stays
 * understandable to a Solver rather than trying to cover every possible
 * runtime-specific field up front). Fields beyond `dependencies` are
 * carried here so the skeleton is forward-compatible with execution modes
 * beyond today's single batch-run mode, but only `runtime`/`dependencies`
 * are consumed anywhere today (see lib/sandbox/runtimes.ts,
 * lib/sandbox/bountied-manifest.ts).
 */
export type BountiedManifestSkeleton = {
  runtime: {
    language: string;
    version: string;
  };
  dependencies: Record<string, string>;
};

/**
 * Per-language runtime defaults for the skeleton's `runtime` block. Only
 * languages with an entry here get a generated skeleton — everything else
 * falls back to a generic skeleton (see buildManifestSkeleton) rather than
 * blocking on every one of flow-data.ts's 24 defined languages having a
 * hand-picked default version. Extend this as a language actually becomes
 * ready (gets an E2B template — see lib/sandbox/runtimes.ts) rather than
 * ahead of that; an AI-filled version for a language with no real sandbox
 * support yet has nothing to be checked against.
 */
const RUNTIME_VERSION_DEFAULTS: Record<string, string> = {
  python: "3.12",
};

export function buildManifestSkeleton(languageId: string): BountiedManifestSkeleton {
  const label = getLanguageDef(languageId)?.label ?? languageId;
  return {
    runtime: {
      language: label,
      version: RUNTIME_VERSION_DEFAULTS[languageId] ?? "latest",
    },
    dependencies: {},
  };
}

/**
 * Pretty-printed, ready to copy straight into bountied.json at the repo
 * root. 2-space indent matches how the Solver's AI assistant is instructed
 * (in the prompt below) to preserve the file's formatting when it fills in
 * values — keeping the sample and the expected output visually identical.
 */
export function renderManifestSkeleton(languageId: string): string {
  return JSON.stringify(buildManifestSkeleton(languageId), null, 2);
}

/**
 * Builds the dynamic prompt a Solver pastes into their own AI coding
 * assistant (Claude Code, Cursor, Copilot, etc.) to have it generate the
 * real bountied.json for their specific submission. Tailored by language +
 * scope (both already collected from the Giver at bounty creation — see
 * flow-data.ts) so a Python ML bounty and a Python web-backend bounty get
 * pointed at different dependency-detection instincts, without the prompt
 * turning into one giant generic "figure it out" block.
 *
 * Deliberately schema-locked rather than open-ended (per this module's
 * top doc comment): the instructions are explicit that the AI fills in
 * VALUES against the given skeleton and must not add, rename, or remove
 * top-level keys. This is the actual mechanism that keeps every submitted
 * bountied.json parseable by the same fixed logic in
 * lib/sandbox/bountied-manifest.ts regardless of which AI assistant or
 * Solver produced it.
 */
export function buildManifestPrompt(params: {
  languageId: string;
  scopeId: string | null;
  runCommand: string;
}): string {
  const { languageId, scopeId, runCommand } = params;
  const languageLabel = getLanguageDef(languageId)?.label ?? languageId;
  const scopeLabel = scopeId ? getScopeDef(languageId, scopeId)?.label ?? null : null;
  const skeleton = renderManifestSkeleton(languageId);

  const scopeLine = scopeLabel
    ? `This is specifically a "${scopeLabel}" problem — pay attention to the ` +
      `dependencies that category typically needs (e.g. don't skip a web ` +
      `framework for a backend-API scope, or a data library for a data-` +
      `analysis scope), but only include what my code actually imports.`
    : "";

  return [
    `I'm submitting a ${languageLabel} solution to a Bountied bounty and need a bountied.json file for it.`,
    "",
    "Inspect this repository yourself — its actual imports, package manager files, and code — and fill in the JSON below with the real runtime version and dependencies this project needs. Do not guess or invent dependencies that aren't actually used in the code.",
    "",
    "IMPORTANT — follow the exact shape below. Only fill in values. Do not add, rename, or remove any top-level keys, and do not change the structure:",
    "",
    "```json",
    skeleton,
    "```",
    "",
    `- "runtime.version": the actual ${languageLabel} version this project targets (check for a version file, lockfile, or config if present; otherwise infer from syntax/features used).`,
    `- "dependencies": an object of "package name": "version" for every external dependency this code actually imports. Use the package's real published name (the name you'd install it by), not the name it's imported as, if they differ. Leave it as {} if the project only uses the standard library.`,
    scopeLine,
    "",
    "Once you've filled it in, place the result at the root of my repository as bountied.json.",
  ]
    .filter(Boolean)
    .join("\n");
}
