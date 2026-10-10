import { Template } from 'e2b'

/**
 * E2B sandbox template for Runtime.PYTHON — see lib/sandbox/runtimes.ts's
 * RUNTIME_REGISTRY.PYTHON entry (templateId "1z9fpclwmf3aeijmmv6s").
 *
 * This did not exist in the repo before product decision 2026-09-28 — it
 * was built and applied directly from a local copy
 * (D:\e2b-templates\python\bountied_temp_py on the deploy machine)
 * without ever being committed, leaving no reviewable/reproducible record
 * of what's actually running in the live template. Committed here
 * verbatim from that local copy so the repo is the source of truth going
 * forward.
 *
 * git is required — lib/sandbox/execute.ts clones the solver's mirrored
 * repo with `git clone` as the first sandbox command.
 */
export const template = Template()
  .fromImage('python:3.11-slim')
  .runCmd('apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*', {
    user: 'root',
  })
