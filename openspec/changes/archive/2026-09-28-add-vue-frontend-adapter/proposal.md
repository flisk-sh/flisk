## Why

Flisk currently generates React directly inside the generic frontend resource command, so framework-specific assumptions are difficult to extend safely and community contributions lack a documented path. Isolating React first creates a stable adapter boundary, after which Vue can be added as an opt-in provider without changing the React default or shared Flisk runtime contract.

## What Changes

- Separate framework-neutral frontend generation from the React starter and preserve React as the default for existing and new frontend resources.
- Document the adapter contract and contributor steps in `CONTRIBUTING.md` and a focused guide, including how to add Vite-based SPA providers by starting from the React adapter.
- Add an opt-in Vue 3 + Vite + TypeScript frontend provider with generated entry files, dependencies, and configuration.
- Add automated checks for adapter registration, generated Vue output, React default/backward compatibility, and the supported CLI quality checks in the existing CI test suite.

## Capabilities

### New Capabilities

- `frontend-framework-adapters`: Framework-specific frontend scaffolding behind a shared Flisk frontend contract.
- `frontend-framework-contributions`: Contributor documentation and checks for adding frontend framework adapters.

### Modified Capabilities

None. Framework selection is specified as part of the new `frontend-framework-adapters` capability.

## Impact

- Affected code: `cli/src/commands/resource.ts`, frontend template/generator modules, and CLI tests run by the existing `.github/workflows/ci.yml` test job.
- Affected documentation: `CONTRIBUTING.md`, `docs/`, and CLI frontend resource documentation.
- Generated service metadata and CLI options may gain an optional frontend framework identifier; Docker, nginx, Tilt, ports, and generated API/environment modules remain shared.
- Vue dependencies belong only to generated Vue resources; the Flisk CLI runtime does not gain Vue as a dependency.
