> **Scope update:** Node.js was cut from this change at review and will return as its own change. Remaining Node mentions below describe that deferred work.

## Context

Backend scaffolding lives in `cli/src/commands/resource.ts` and has always emitted a Bun + Hono service, a TypeScript entry, and a Bun Dockerfile. Frontend frameworks already use a provider registry (`cli/src/frontend-frameworks`) plus Starlark templates. `docs/frontend-framework-providers.md` is the pattern to follow: a registry defines valid ids, a default constant stays fixed, the schema enum matches the registry, ids fail closed before writes, and interactive creation does not gain a picker.

`bring-your-own` already wraps an existing Dockerfile or image. It stays the escape hatch for Go, Java, legacy services, and other languages without a provider.

Backend providers cannot share the image the way frontend providers share Docker and nginx. Frontend providers produce Vite applications that use the same build and serving path. Node.js and Python backends need different base images and process reload commands. Language-specific Dockerfiles and Tilt reload behavior are therefore provider-owned; port allocation, routing, database provisioning, health checks, and stack orchestration remain shared. A failed default-example E2E run showed a backend waiting forever on `tdk_example_shop` even though Tilt reported `provision-db-shop` as updated. Because this backend only starts its HTTP server after dependency connections succeed, the routed `/health` probe eventually receives 404. This proposal requires the provisioner status to reflect the database postcondition and the example E2E to prove the full routed path.

## Goals / Non-Goals

**Goals:**

- Preserve today's omitted-language output exactly: Bun + Hono, with the existing port range and health path.
- Keep `DEFAULT_BACKEND_LANGUAGE` set to `bun`; add `python` as an explicit provider.
- Resolve provider ids case-insensitively and persist the normalized id when a provider is explicitly selected.
- Reject an unknown `--language` before creating a directory, and reject `--language` on any type other than backend.
- Generate a Python service that answer `/health` and are reachable through the existing Traefik hostname.
- Implement language-specific images and Tilt reload behavior without changing Bun live-update.
- Ensure a database-backed backend cannot start before the database named by its generated `DATABASE_URL` exists, and make provisioning failures visible instead of reporting success.
- Ship `examples/one-backend-python/` so a user can run a Python backend with documented commands, and boot it in CI.
- Keep the default example E2E proving database readiness, routed health, and a write/read path through the API and worker.
- Document provider-owned files versus shared files, including the intentional Docker and reload difference from frontend providers.

**Non-Goals:**

- Establishing Bun as a default. It already is.
- Rewriting existing backend `service.json` files to insert `language`.
- Changing interactive creation. It keeps scaffolding Bun and does not prompt for a language.
- Adding Go, Java, Flask, or another Python framework in this change.
- Prisma, NATS, or Verdaccio wiring for Node.js or Python.
- Adding Python, FastAPI, uvicorn, or generated service dependencies to the CLI package.
- Replacing `bring-your-own`.
- Adding Python worker or migrator support.

## Decisions

### Missing `language` means the historical Bun provider

Resolution matches the frontend `framework` behavior while preserving the backend's established default:

1. An explicit `--language <id>` selects a registered provider. Matching is case-insensitive (`Node` selects `node`).
2. An omitted `--language` selects Bun, as it has always done.
3. A legacy `service.json` with no `language` field remains valid and means Bun. Discovery and `flisk up` do not rewrite it only to insert the field.
4. An unknown id fails before any resource files are written, with an actionable message listing the supported ids.

New resources may persist the resolved language. That metadata records the selected provider; it is not a migration and does not make Bun the default.

### Registered ids `node` and `python`

This change adds two explicit starter templates:

- `node`: TypeScript HTTP API using the Node.js runtime, a `/health` route, a Node `package.json` start command, and a Node.js Docker image.
- `python`: FastAPI + uvicorn on Python 3.12, a `/health` route, `pyproject.toml`, a pytest smoke test, and a `python:3.12-slim` Docker image.

Bun remains registered as the existing default provider. Do not add `--type node` or `--type python`; language is a backend template choice, not a new resource type.

### `--language` applies only to backend creation

The flag follows the explicit-selection pattern of frontend `--framework`. Using it with `frontend`, `worker`, `bring-your-own`, `sdk`, `library`, or `migrator` fails before writes. Interactive backend creation still uses Bun and does not prompt for a language.

### Shared backend contract, language-owned runtime files

Every provider uses the shared service metadata and orchestration contract, including database lifecycle:

- `appName`, `appType: "backend"`, `stack`, `port`, `healthCheckPath`, and `dependsOn`
- port allocation in 4000–4999
- existing Traefik route and hostname conventions
- health-gated boot order
- stack-slice selection such as `flisk up <stack>`
- database provisioning for the stack database used in `DATABASE_URL`; the provisioner succeeds only after the database exists and is connectable

The backend runtime waits for its declared infrastructure dependencies. A database-enabled service must depend on the matching stack provisioner as well as PostgreSQL. The example E2E exercises this with the `shop` stack: it verifies the expected database exists, then checks routed `/health` and the order write/read path. A provisioner update status alone is insufficient evidence of readiness.

The Bun provider owns the existing Hono entry, package scripts, and Bun Dockerfile. The Node provider owns its TypeScript entry, `package.json` start script, Node Dockerfile, and Node reload command. The Python provider owns `pyproject.toml`, `src/main.py`, `tests/test_health.py`, its Python Dockerfile, and uvicorn reload command. Starlark writes language-aware Tilt configuration under the existing generated-config paths. Do not emit a second Compose file or put Bun in Node/Python images.

This differs from the frontend provider guide intentionally: backend runtime images and process reload commands depend on the language, while ports, routing, health behavior, and stack orchestration stay shared.

### Python example lives beside `one-backend`, not inside the default example

`examples/one-backend-python/` mirrors `examples/one-backend/`: one authored `service.json` with `"language": "python"`, the provider's FastAPI files, and a README. Adding a Python service to `examples/tdk-example` would put a second language in the required eight-minute default-example gate and change what `flisk project example` produces, so the default example stays Bun-only. A drift test compares the example with `flisk resource --type backend --language python` output so the example cannot rot. A path-filtered CI job boots the example, checks routed `/health`, and runs the pytest smoke test inside the built image, so the runner needs no host Python toolchain.

### CLI runtime stays language-neutral

Generated Node and Python dependencies belong to the generated service only. The CLI package must not acquire FastAPI, uvicorn, or service-template dependencies. Tests should assert generated file contents and metadata; do not require a Python interpreter unless an existing CI job already provides one.

### Keep the provider contract small and reviewable

The registry is the source of valid language ids, with a schema enum kept in sync by a drift test. Keep shared metadata and orchestration in the generic backend path; provider definitions own only language-specific files and runtime settings. The contributor guide should recommend one provider per implementation pull request even though this proposal specifies both Node and Python templates.

## Risks / Trade-offs

- Extracting the Bun starter can change generated output accidentally. Capture today's Bun file set in a test before the move, then compare after extraction.
- Tilt reload behavior may differ across Docker Desktop setups. Test sync paths and document a container restart fallback if process reload is unreliable.
- Database provisioning can report a successful Tilt update without the target database being present. Check the database postcondition and fail the resource update when creation fails; retain the end-to-end example as coverage for startup ordering.
- Node starter dependency choices can become an accidental framework commitment. Keep the provider contract language-oriented and limit the starter to a small HTTP service.
- FastAPI as the only Python framework is opinionated. `bring-your-own` remains available; another Python framework can be proposed separately.

## Migration Plan

1. Extract the existing Bun starter behind a provider registry, preserving the default and captured output.
2. Add Node and Python providers, schema ids, images, Tilt reload behavior, and focused scaffold tests.
3. Add `examples/one-backend-python/`, its drift test, and its CI job.
4. Correct database provisioning and dependency ordering so success guarantees the stack database exists; verify it through the default example E2E.
5. Add the contributor guide and CLI selection examples.

Rollback is a revert. Existing generated services need no migration.

## Open Questions

None. Python worker and migrator support are out of scope. Existing source files are not recreated by `flisk config regenerate`.
