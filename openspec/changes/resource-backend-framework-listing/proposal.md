## Why

`tdk resource --frameworks` prints only the frontend frameworks, even though `--framework` also accepts the
backend frameworks (Hono, Express, Elysia, Fastify, NestJS, Koa, h3) and the backend languages
(Bun, Python, Go, Rust, Node). A user who wants to know which backend framework to pick has to read the
README or the docs, and the docs never say which framework can be combined with which language: a language
that owns its runtime (Python, Go, Rust, Node) cannot be combined with a framework at all, and the CLI
only says so after the resource directory was already being created.

The frontend listing also cannot say what it is: `tdk resource --frameworks` and
`tdk resource --type frontend --frameworks` are the same command, and there is no way to ask for the
backend list.

## What Changes

- `tdk resource --type backend --frameworks` lists every registered backend framework with its id, its
  display name, the language (and runtime) it is scaffolded with, and the exact `tdk resource` command to
  copy.
- The listing is derived from the CLI registries (`cli/src/backend-frameworks/registry.ts` and
  `cli/src/backend-languages/registry.ts`) and from the same validation the resource command uses, so it
  can never drift from what `--framework` and `--language` actually accept.
- `tdk resource --type backend --language <id> --frameworks` marks every framework that cannot be combined
  with the requested language, instead of leaving the user to hit the error at creation time. The
  compatibility cell names the language it is judged against, and the printed command names the requested
  language, so a copied row scaffolds that language instead of silently falling back to Bun.
- `tdk resource --frameworks` (no `--type`) keeps the historical frontend listing, byte for byte, so
  scripts and docs that rely on it keep working. `--type frontend` prints the same list, and a `--language`
  without an explicit `--type` does not change it.
- A resource type without frameworks (`worker`, `mcp`, `agent`, `bring-your-own`, `sdk`) fails with an
  actionable message instead of an empty list.
- `tdk resource --help` documents `--type backend --frameworks`.

## Capabilities

### New Capabilities

- `resource-framework-inventory`: The CLI can list the frameworks registered for a resource type, with the
  language and runtime a backend framework is scaffolded with, and with the compatibility of a requested
  language.

### Modified Capabilities

None. The frontend framework inventory keeps its current shape, and the frontend adapters, backend
language providers and backend framework providers are untouched.

## Impact

- Affected code: `cli/src/backend-frameworks/registry.ts` (new `listBackendFrameworks`),
  `cli/src/commands/resource.ts` (type-aware `--frameworks` listing and help text).
- Affected tests: `cli/src/commands/__tests__/resource-framework-inventory.test.ts` (new),
  `cli/src/commands/__tests__/resource-backend-frameworks.test.ts` (inventory unit tests).
- Affected docs: `cli/README.md`, `docs/cheat-sheet.md`, `docs/frontend-framework-providers.md`,
  `docs/backend-language-providers.md`.
- No new runtime dependency, no change to the generated scaffold, Docker, Traefik or Tilt behavior.
- Interactive framework prompts are out of scope (issue #1733).
