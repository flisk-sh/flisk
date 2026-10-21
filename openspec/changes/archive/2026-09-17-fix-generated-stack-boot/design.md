# Fix Generated Stack Boot - Design

## Context

`tdk project` and `tdk resource` produce output that must run on a fresh machine with Docker + Tilt. Two defects broke this path for every user: (1) the backend source template emitted a literal newline inside a single-quoted `console.log` string, making every generated service uncompilable; (2) the generated Tiltfile pointed at an author-specific absolute path (`/private/var/www/2025/ollamar1/tdk-cli`) and fell back to a private GitHub repo that cannot be cloned, causing `tdk up` to hang in a git retry loop. The fixes below were implemented and verified in an isolated container (fixed binary rebuilt from source, `bun run` + `curl /health` green, `tilt ci` loads the vendored extension and reports a healthy workspace).

## Goals / Non-Goals

**Goals:**
- Generated services compile and serve `/health` on first run.
- `tdk up` loads its Tiltfile on any machine with zero network or private-repo dependency.
- Generated output contains no machine-specific paths and fails fast with actionable errors when misconfigured.
- Extension loading uses a truthful local probe.

**Non-Goals:**
- Rewriting the TDK Tilt extension itself or its orchestration semantics.
- Making the private `tdk-cli` source repo public.
- Changing the generated `service.json` manifest shape (tracked separately in manifest-field-migration).
- Container-to-host DNS routing (traefik `*.beauty-crm.localhost` mapping) is outside this change.

## Decisions

### D1. Do not hardcode or publish; vendor instead
Vendor the extension into each generated project (`.tdk/.tdk-out/tdk-cli-ext/`) at generation time. Rationale: matches the "releases public, source private" position, works offline, and a vendored project stays reviewable and relocatable. The source is located via, in order: `$TDK_EXTENSION_SOURCE`, an executable-adjacent `tdk-cli` checkout, then a `../tdk-cli` sibling of the project root. Missing source logs a warning; the Tiltfile then fails fast with recovery instructions.

### D2. Escape newlines at the template boundary
In `cli/src/commands/resource.ts`, `getBackendIndexTemplate` emits `console.log('\n🚀 ...')`. The template is a JS template literal, so `\n` becomes a real newline in the emitted file. The source therefore uses `\\n` so generated files contain the two-character escape sequence and remain valid Bun source.

### D3. Fail fast instead of a private-repo fallback
The Tiltfile resolution order is: vendored path -> `$TDK_EXTENSION_PATH` -> `fail(...)` with the three recovery options. This eliminates the infinite `git clone` retry against `github.com/flisk-sh/tdk-cli` (private, 404 to unauthenticated clients).

### D4. Truthful local probe
The presence probe must produce output: `test -d <path> && echo yes || echo no`. A probe returning `""` (as the first iteration did) silently disables detection and routes every run to the fail-fast branch.

### D5. Vendoring lives in `generateMasterConfigs`
The copy step runs in `generateMasterConfigs` (alongside writing `Tiltfile`, `spec.master`, etc.) so regeneration repairs a stale or missing vendored extension.

## Risks / Trade-offs

- **Project size**: vendoring adds ~2.5 MB of starlark per project. Accepted for offline, private-repo-free bootstrapping; the copied set is limited to `Tiltfile`, `engine/`, `discovery/`, `specs/`, `ext/`.
- **Stale binary releases**: released `release-dist-*` binaries still contain both bugs. Release artifacts must be rebuilt (proven command: `bun build --compile --target=bun-linux-arm64 --outfile tdk-linux-arm64 cli/src/cli.ts`) and republished before users see the fix.
- **Probe coupling**: detection depends on `local()` emitting the echo; documented in the template comment so future edits keep the `&& echo yes || echo no` tail.
- **Sandbox verification ceiling**: full container orchestration (image builds via traefik network, `*.beauty-crm.localhost` DNS) requires a host network; the isolated-container verification covers generation, compilation, Tiltfile loading, service discovery, resource creation, and workspace health.