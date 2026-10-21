## Why

The CLI boots a stack. A second person still cannot tell what is enforced, what is unfinished, and how a release is cut. This change closes that gap. It does not add frameworks or a deploy path.

## What Changes

- Drift between `service.json` and generated files fails the run.
- `flisk import` either imports the four common files or says it does not.
- One runbook covers install, support matrix, release, and a missing license key.
- `ADOPTERS.md` says there are no external adopters until one is real.

## Capabilities

### New Capabilities
- `drift-gate`: `flisk up` verifies generated files against `service.json` before Tilt starts.
- `import-or-refuse`: `flisk import` handles Tier-1 files only and refuses everything else explicitly.
- `operator-runbook`: one documented page for install, support matrix, release, and license behavior.
- `adopters-file`: `ADOPTERS.md` makes no implied claims about users.

### Modified Capabilities
- None.

## Non-goals

- Native Windows `flisk up`, new languages, premium features, user claims.
- New frameworks or a deploy path.

## Impact

- Affected: `cli/`, `engine/`, docs, `ADOPTERS.md`.
- Commands: `flisk up`, `flisk config verify`, `flisk import`, `flisk doctor`.
- Scope: one day.
