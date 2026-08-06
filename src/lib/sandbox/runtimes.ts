import type { Runtime } from "@prisma/client";

/**
 * Single source of truth for what each Runtime actually needs to execute.
 * Everything downstream (lib/sandbox/execute.ts, the submission form, the
 * giver preview) reads from this registry and is written to be runtime-
 * agnostic — none of it should ever say "if runtime === PYTHON" directly.
 * Adding a language is: add one entry here, build one E2B template, done.
 *
 * templateId: the E2B template to launch sandboxes from. Each runtime gets
 * its own template (its own Dockerfile, built via `e2b template build`) —
 * see /sandbox-templates/<runtime>/e2b.Dockerfile for the source. Until a
 * template is built and its real ID pasted in here, that runtime is
 * registered but not actually usable — see isRuntimeReady() below.
 *
 * dependencyFileName: the file, if any, a solver's submission is expected
 * to include for the sandbox to install their dependencies from.
 *
 * installCommand: run once, before the giver's runCommand, only if
 * dependencyFileName is present in the submitted code. null means no
 * install step (nothing to install, or the runtime handles it inline).
 */
export type RuntimeConfig = {
  label: string;
  templateId: string | null;
  dependencyFileName: string | null;
  installCommand: ((depFile: string) => string) | null;
  /** File extension used for single-file uploads in the submission form. */
  fileExtension: string;
};

export const RUNTIME_REGISTRY: Record<Runtime, RuntimeConfig> = {
  PYTHON: {
    label: "Python",
    // TODO: replace with the real template ID after running
    // `e2b template build` against sandbox-templates/python/e2b.Dockerfile
    templateId: "1z9fpclwmf3aeijmmv6s",
    dependencyFileName: "requirements.txt",
    installCommand: (depFile) => `pip install -r ${depFile}`,
    fileExtension: ".py",
  },
};

export function getRuntimeConfig(runtime: Runtime): RuntimeConfig {
  return RUNTIME_REGISTRY[runtime];
}

/** A runtime is only actually usable once its E2B template has been built and its ID filled in. */
export function isRuntimeReady(runtime: Runtime): boolean {
  return RUNTIME_REGISTRY[runtime].templateId !== null;
}

export function listReadyRuntimes(): Runtime[] {
  return (Object.keys(RUNTIME_REGISTRY) as Runtime[]).filter(isRuntimeReady);
}
