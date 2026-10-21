> **Scope update:** Node.js was cut from this change at review and will return as its own change. Remaining Node mentions below describe that deferred work.

## Why

`flisk resource --type backend` has always scaffolded a Bun + Hono service. That default is existing behavior, not something this change introduces. A team that wants a Node.js or Python API today has to use `bring-your-own` and write the Dockerfile, health check, and Tilt sync by hand. Frontend frameworks already have an opt-in provider seam (React default, Vue registered). Backends need the same seam, with Bun left as the default and Node.js and Python offered as explicit template choices.

## What Changes

- Preserve the existing Bun + Hono output when `--language` is omitted. Do not redefine or newly establish Bun as the default.
- Add an opt-in Python backend template selected with `flisk resource <name> --type backend --language <node|python> --stack <stack>`.
- Persist the selected `language` on resources created with an explicit provider. A missing `language` on a legacy manifest continues to mean Bun and does not trigger a rewrite.
- Generate a Node.js TypeScript service with `/health`, a Node start script, a Node Docker image, and Tilt reload behavior; generate a FastAPI service with `/health`, `pyproject.toml`, a Python Docker image, and Tilt live-update behavior.
- Ship `examples/one-backend-python/`, a runnable Python counterpart of `examples/one-backend/`, kept identical to the generated Python template by a drift test and booted by a path-filtered CI job.
- Keep Python, FastAPI, uvicorn, and generated service dependencies out of the Flisk CLI runtime. Generated files belong only to each resource.
- Document the provider contract alongside `docs/frontend-framework-providers.md`, including where backend providers intentionally own language-specific images and reload commands.
- Leave `bring-your-own` unchanged. It remains the path for languages without a provider.

## Capabilities

### New Capabilities

- `backend-language-providers`: Language-specific backend scaffolding behind the shared backend service contract. Bun stays the historical default; Node.js and Python are opt-in templates.

### Modified Capabilities

None. Language selection is part of the new capability. `bring-your-own` is unchanged.

## Impact

- Affected code, in the implementation PR: `cli/src/commands/resource.ts`, a new `cli/src/backend-languages/` provider registry, Starlark Docker and Tilt generators for Node.js and Python, `engine/schemas/service-schema.json`, and CLI tests.
- Affected examples and CI: new `examples/one-backend-python/`, a drift test against the Python provider output, and a path-filtered workflow that boots it.
- Affected docs: `cli/README.md`, `docs/backend-language-providers.md`, and a link from `CONTRIBUTING.md`.
- Shared ports, Traefik routing, database provisioning, health-checked boot order, and stack slices remain one contract for all providers. The example E2E must verify that its stack database exists before the backend reports healthy and accepts routed requests.
- `flisk config regenerate` still rebuilds project-level master config only. It does not recreate resource source.
- This pull request contains planning artifacts only. Implementation tasks remain unchecked.
