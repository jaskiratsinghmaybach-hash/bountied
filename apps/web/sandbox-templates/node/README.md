# bountied_temp_node - E2B Sandbox Template

E2B sandbox template for Runtime.NODE — see
`src/lib/sandbox/runtimes.ts`'s `RUNTIME_REGISTRY.NODE` entry for how the
built template ID gets wired into the app.

## Prerequisites

- An E2B account (sign up at [e2b.dev](https://e2b.dev))
- Your E2B API key (get it from your [E2B dashboard](https://e2b.dev/dashboard))
- Node.js and npm installed

## Configuration

Create a `.env` file in this folder (`sandbox-templates/node/`) with:
```
E2B_API_KEY=your_api_key_here
```

## Installing dependencies

```bash
cd sandbox-templates/node
npm install
```

## Building the template

```bash
# For development
npm run e2b:build:dev

# For production
npm run e2b:build:prod
```

On success, the build prints a template ID. Copy it into
`RUNTIME_REGISTRY.NODE.templateId` in `src/lib/sandbox/runtimes.ts` (it's
`null` there until this has been run once — see `isRuntimeReady()` in that
same file, which gates the Node language option everywhere in the app
until a real ID is set).

## Using the template in a sandbox

```typescript
import { Sandbox } from 'e2b'

const sandbox = await Sandbox.create('bountied_temp_node')
```

## Template structure

- `template.ts` - Defines the sandbox template configuration
- `build.dev.ts` - Builds the template for development (`bountied_temp_node-dev`)
- `build.prod.ts` - Builds the template for production (`bountied_temp_node`)

Mirrors the structure of the working `sandbox-templates/python` template
one-to-one — same base pattern, same dependency versions — so the two stay
easy to compare and keep in sync.
