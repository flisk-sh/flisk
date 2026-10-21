## Why

Generated projects from `flisk project` and `flisk resource` shipped two blockers that broke the quickstart for every user: generated Bun services did not compile (the backend template emits a literal newline inside a `console.log('...')` string, producing `Unterminated string literal`), and `flisk up` could never load its Tiltfile because it hardcoded a machine-specific extension path and fell back to a private GitHub repo that triggers an endless git-clone retry loop. Both were reproduced in an isolated Docker container and verified fixed in source, but the fixes are not yet reflected in released binaries or a tracked spec.

## What Changes

- `cli/src/commands/resource.ts`: escape newlines in the generated backend `src/index.ts` so emitted files contain `\n` and compile (`console.log('\n...')`).
- `cli/templates/Tiltfile.hbs`: resolve the Flisk Tilt extension in order - vendored in-project copy (`.tdk/.tdk-out/tdk-cli-ext`) -> `$TDK_EXTENSION_PATH` -> fail fast with actionable instructions. Remove the hardcoded `/private/var/www/2025/ollamar1/tdk-cli` path and the private-repo fallback.
- `cli/src/generator/template-engine.ts`: vendor the extension (engine/discovery/specs/ext) into `.tdk/.tdk-out/tdk-cli-ext/` during `generateMasterConfigs`, so `flisk up` works offline on any machine without GitHub access. Source is auto-detected via `$TDK_EXTENSION_SOURCE`, executable-adjacent checkout, or a `../tdk-cli` sibling.
- `cli/templates/Tiltfile.hbs`: fix the local-directory probe to echo its result (`test -d <path> && echo yes || echo no`); the previous probe returned `""`, so the vendored extension was never detected and `flisk up` always failed at the new fail-fast gate.
- Rebuild release binaries from the fixed source and republish to `flisk-sh/tdk-cli-releases` (**BREAKING** for existing releases - new generated output shape).

## Capabilities

### New Capabilities

- `self-contained-generated-projects`: generated projects must boot without network or private-repo access - extension vendored at generation time, Tiltfile loads it from a local `file://` repo, and generated service sources compile on first `bun run`.

### Modified Capabilities

- `manifest-field-migration`: no requirement changes; generated `service.json` shape is unchanged.

## Impact

- `cli/src/commands/resource.ts` - backend index template escaping.
- `cli/templates/Tiltfile.hbs` - extension resolution and probe.
- `cli/src/generator/template-engine.ts` - vendoring step, `.tdk/.tdk-out/tdk-cli-ext/` output.
- `release-dist-*` snapshots - must be regenerated from fixed source.
- Verification: generated services compile and serve `/health` via Bun; `tilt ci` on a generated Tiltfile loads the vendored extension, discovers services, creates resources, and reports a healthy workspace.