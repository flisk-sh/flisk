# Design

## Context

Three existing commands are not the same operation:

| Command | Reads | Writes | Does not do |
| --- | --- | --- | --- |
| `tdk config regenerate` | `.tdk/project.json` | generated master files | edit `service.json`, import a repo |
| `tdk config migrate` | `service.json` | `schemaVersion` on those files | rewrite Docker or Tilt files |
| `tdk import` | a directory, via `tdk-import` | whatever `tdk-import` writes | call regenerate or migrate |

`tdk config verify` compares generated files with `.tdk/project.json`. Its fix line is `tdk config regenerate`. Doctor already returns `schemaVersion: 1`, `data.ready`, `data.checks`, and `errors`. Exit codes are 0 ready, 1 blocking, 2 usage or internal.

## Goals / Non-Goals

- Goals for this ship: regenerate, migrate, and import stay three commands. Verify still points at regenerate. Doctor JSON and exit codes do not change. Tests prove those boundaries.
- Non-Goals, do not do them in this change: new commands, `tdk up` idempotency, partial-startup reporting, Ctrl+C recovery, port-owner detection, UI redesign, logs follow mode, lock file, golden suite for every fixture, platform-matrix CI, offline mode, concurrency locks, security review, Kubernetes, native Windows runtime.

## Decisions

- Ship the boundary tests first. Do not block them on runtime work from issue #661.
- Drift is fixed only by `tdk config regenerate`. Schema lag is fixed only by `tdk config migrate`. Bringing an existing repo in is only `tdk import`.
- Regenerate `--dry-run` writes nothing. Migrate writes `service.json` only when the schema version is missing and the file validates. An unsupported `schemaVersion` fails with no write.
- Import stays a pass-through to `github:flisk-sh/tdk-import`. Exit code passes through. npx failure stays exit 127.
- Later changes may pick up idempotent `tdk up` and status/UI agreement. They are not tasks here.

## Risks / Trade-offs

- Issue #661 says `tdk generate` and `tdk migrate`. Those names are not the CLI. The spec uses the existing command names so the three operations stay distinct.

## Migration Plan

No command renames. No JSON shape change.

## Open Questions

- None that block this change.
