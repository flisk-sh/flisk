## Why

`flisk resource --type backend` defaults to Bun + Hono. Backends can also select Python (FastAPI), Go (`net/http`), and Rust (`axum`). While Bun supports many JavaScript frameworks, teams frequently need standard Node.js (Node 22 LTS) for:
- Corporate compliance policies that restrict container base images to official Node.js LTS distributions.
- Native C/C++ addons (e.g. sharp, canvas, grpc, specific database drivers) that have compatibility issues under alternative runtimes.
- Predictable execution on the long-term stable Node.js runtime.

When the backend provider abstraction was first introduced in `openspec/changes/add-python-backend-provider`, Node.js was deferred to its own change. This change introduces `node` as an opt-in backend language provider following the exact pattern established by Python, Go, and Rust.

## What Changes

- Register `node` as an opt-in backend language provider selected with `flisk resource <name> --type backend --language node --stack <stack>`.
- Bun remains the historical default when `--language` is omitted; omitted output is unchanged.
- Scaffolding generates a minimal, zero-dependency Node 22 ES module service (`package.json`, `src/index.js`, and `tests/health.test.js`) using standard library `node:http` and `node:test`.
- The engine generates the multi-stage Dockerfile (`node:22-slim`) with development, test, and production stages, health check probe, and `PORT` contract.
- Tilt live-update syncs `src/` changes into the container where `node --watch` restarts the process without an image rebuild; changes to `package.json` trigger a full rebuild.
- Add test coverage in `cli/src/commands/__tests__/resource-backend-languages.test.ts` and documentation in `cli/README.md` and `docs/backend-language-providers.md`.

## Capabilities

### New Capabilities

- `backend-language-provider-node`: Scaffolds and runs Node.js 22 LTS backend services with native `node:http`, built-in `--watch` reload, and standard library test runner.

### Modified Capabilities

None. Bun remains the default. Existing Python, Go, Rust, and `bring-your-own` behaviors are unaffected.

## Impact

- Affected CLI code: `cli/src/backend-languages/node.ts`, `cli/src/backend-languages/registry.ts`, `cli/src/commands/resource.ts`.
- Affected engine code: `engine/topologies/platform/docker/dockerfile/language_dockerfile.star`, `engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star`, `engine/topologies/tilt/generators/validators.star`.
- Affected docs: `cli/README.md`, `docs/backend-language-providers.md`, `docs/cheat-sheet.md`, `docs/service-json.md`.
