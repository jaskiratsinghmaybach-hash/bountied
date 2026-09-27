import 'dotenv/config';

import { Template, defaultBuildLogger } from 'e2b'
import { template } from './template'

/**
 * Dev build — separate template name/tag from build.prod.ts so you can
 * iterate on template.ts without touching the template
 * lib/sandbox/runtimes.ts's RUNTIME_REGISTRY.NODE.templateId actually
 * points production traffic at. Mirrors the same dev/prod split already
 * used by the working Python template.
 */
async function main() {
  await Template.build(template, 'bountied_temp_node-dev', {
    onBuildLogs: defaultBuildLogger(),
  });
}

main().catch(console.error);
