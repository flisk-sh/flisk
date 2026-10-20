## Why

`tdk project` creates the local project configuration and can clone a starter template, but it runs the Docker/Tilt cold preflight before doing either. A developer who is preparing a project - or working in a devcontainer or on a remote machine where the Docker daemon is not running and Tilt is not installed yet - is blocked before setup is complete. The local runtime is only needed to start a stack, so the readiness check belongs on `tdk up`, not on project scaffolding.

## What Changes

- Split the cold preflight into two scopes: `runtime` (Docker, Compose, Tilt, Bun, ports, project wiring) and `scaffold` (Node, Bun, host ports).
- Run `tdk project` in the scaffold scope, so it initializes a project or clones a starter template with Docker stopped and Tilt not installed, and it never contacts the Docker daemon while setting a project up.
- Print a next-step hint after project setup that names the missing runtime pieces (`tdk doctor` for readiness, `tdk up` to start the stack) instead of failing.
- Keep the runtime preflight unchanged for `tdk up`: a missing Docker daemon, Compose plugin or Tilt still blocks the startup with the ranked failures and their fixes.
- Keep `tdk doctor` as the explicit readiness check for the whole machine.

## Capabilities

### New Capabilities

- `project-scaffold-without-runtime`: Project configuration and starter-template setup complete without a running Docker daemon or an installed Tilt, and report the runtime as a next step instead of a blocker.

### Modified Capabilities

- `tdk-up-lifecycle`: Starting a stack still requires the local runtime, and the readiness gate keeps reporting actionable fixes.

## Non-goals

- Installing Docker, Tilt or Bun automatically.
- Changing the readiness semantics of `tdk up`, `tdk doctor` or any other command.
- Changing generated project files, templates, or the engine.
- Relaxing the Bun requirement of project setup.

## OpenSpec interaction: the unarchived `cold-npx-preflight` change

`cold-npx-preflight` is still open (not archived). Its `cold-npx-preflight` capability carries the requirement
"Startup commands stop before side effects": the `project` and `up` commands MUST run the machine preflight and
MUST exit with code 1 if any of the first six machine checks fail.

This change narrows that requirement for one of the two commands: `tdk project` now runs the scaffold scope, which
keeps the Node, Bun and host-port checks and drops the Docker, Compose and Tilt probes, while `tdk up` stays on the
runtime scope. The two changes therefore contradict each other on `project` until `cold-npx-preflight` is archived.

Reconciliation is required when `cold-npx-preflight` is archived: the "Startup commands stop before side effects"
requirement has to be split, so that `project` is gated on the scaffold checks and `up` on the runtime checks. The
conflict must not be archived silently - the archived `cold-npx-preflight` spec has to record the narrowed gate for
`project`, otherwise archiving it would reintroduce the runtime requirement for project setup.

## Impact

- CLI preflight utility: `cli/src/utils/cold-preflight.ts` (new scopes, runtime prerequisite detection, next-step formatting).
- CLI command: `cli/src/commands/project.ts` (scaffold scope and the next-step hint).
- Tests: `cli/src/utils/cold-preflight-scope.test.ts`, `cli/src/commands/__tests__/project-without-runtime.test.ts`, `cli/src/commands/__tests__/up-runtime-preflight.test.ts`, plus the existing project command tests.
- Documentation: `cli/README.md`, `docs/cheat-sheet.md`, `docs/troubleshooting.md`, `docs/ARCHITECTURE.md`, `docs/ci.md`.
