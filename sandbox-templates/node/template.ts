import { Template } from 'e2b'

/**
 * E2B sandbox template for Runtime.NODE — see lib/sandbox/runtimes.ts's
 * RUNTIME_REGISTRY.NODE entry for how the resulting template ID is wired
 * into the app once built.
 *
 * Structured to match sandbox-templates/python's already-working template
 * (D:\e2b-templates\python\bountied_temp_py on the deploy machine) exactly
 * — same fromImage()/runCmd() shape, same e2b/dotenv versions in
 * package.json — rather than the e2b.Dockerfile + e2b.toml + `e2b
 * template build` v1 flow, which was deprecated 2026-08-01 and is why an
 * earlier attempt at this produced no output and no template ID.
 *
 * git is required — lib/sandbox/execute.ts clones the solver's mirrored
 * repo with `git clone` as the very first sandbox command, for every
 * runtime, not just Node.
 */
export const template = Template()
  .fromImage('node:20-slim')
  .runCmd('apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*', {
    user: 'root',
  })
