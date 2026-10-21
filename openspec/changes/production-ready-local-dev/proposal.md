# Proposal

## Why

`tdk doctor`, `tdk up`, `tdk status`, `tdk ui`, `tdk logs`, `tdk config verify`, `tdk config regenerate`, `tdk config migrate`, and `tdk import` already exist. Their results are not stable enough to trust, and regenerate, migrate, and import are easy to confuse. This change locks those commands. It does not add commands. Issue: https://github.com/flisk-sh/flisk/issues/661

## What Changes

- Lock the three config commands as separate operations:
  - `tdk config regenerate` rewrites generated files from `.tdk/project.json`. It does not edit `service.json`.
  - `tdk config migrate` writes `schemaVersion` on `service.json`. It does not rewrite Docker or Tilt files.
  - `tdk import` runs `flisk-import`. It does not regenerate or migrate.
- Lock `tdk config verify` as the drift check for generated files. The fix hint stays `tdk config regenerate`.
- Lock `tdk doctor` exit codes, outcome lines, and the JSON envelope `{ schemaVersion, data.ready, data.checks, errors }`.
- Lock `tdk up` so a second run does not create a second environment.
- Lock `tdk status`, `tdk ui`, and `tdk logs` so they agree on a failed service.

## Capabilities

### New Capabilities

- `config-command-boundaries`: Regenerate, migrate, and import do not call each other.
- `service-runtime-state`: One ready/not-ready outcome shared by `tdk up`, `tdk status`, and `tdk ui`.
- `local-dev-observability`: Stable errors, port reporting, and redaction on existing commands.
- `local-dev-reproducibility`: Shared version floors and fixtures that lock current commands.

### Modified Capabilities

- `tdk-environment-doctor`: Doctor's current checks, exit codes, and JSON envelope stay the contract.
- `tdk-up-lifecycle`: Repeated `tdk up` and interrupted `tdk up` leave a recoverable environment.
- `generated-config-safety`: `tdk config verify` stays the drift check, and regenerate output is byte-stable.

## Impact

Ship this change. Do not widen it.

### In scope

- Tests that lock the current command boundaries. No new command names.
- `tdk config regenerate` rewrites generated files only. `--dry-run` writes nothing. A second run on the same `.tdk/project.json` is byte-identical.
- `tdk config migrate` writes `schemaVersion` on `service.json` only. It does not rewrite Docker or Tilt files. An unsupported version fails and writes nothing.
- `tdk import` runs `flisk-import` and does not call regenerate or migrate. npx failure stays exit 127.
- `tdk config verify` stays the drift check. The fix line stays `tdk config regenerate`.
- `tdk doctor` keeps exit 0/1/2, `Doctor passed. Next: tdk up`, `Doctor failed. Fix the items above, then run: tdk doctor`, and JSON `{ schemaVersion, data.ready, data.checks, errors }`.

### Out of scope

- New commands, aliases, or flags: `tdk generate`, `tdk migrate`, `tdk logs --follow`, `tdk diagnostics`, `tdk restart`.
- A lock file, a support bundle, or a second UI.
- Rewriting doctor JSON, doctor outcome lines, or status vocabulary.
- Making `tdk up` idempotent, naming partial startup, Ctrl+C recovery, or port-owner detection. Those are later changes.
- `tdk status` / `tdk ui` agreement work beyond a regression test if one already exists.
- Golden fixtures for every stack, platform-matrix CI, performance benchmarks, offline mode, concurrency locks, and a security review.
- Kubernetes, production deploy, replacing Docker or Tilt, native Windows runtime.
- Changing what `flisk-import` detects. That package is a different repo.
