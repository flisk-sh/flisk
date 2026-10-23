## Why

The CLI is advertised as runnable with `npx @flisk-sh/flisk`, but a cold invocation with no arguments currently prints help without checking readiness. The executable also lacks the Node.js 22.12 minimum guard already declared by the package. New users therefore discover basic machine prerequisites only after trying a command, while Bun, Prisma, and NATS can be mistaken for prerequisites even though they are generated or project-specific concerns. This change makes the first run explain the actual blockers in the order users encounter them.

## What Changes

- Add a Node.js 22.12+ guard in the plain Node executable before loading the compiled CLI, and expose the same Node version check through doctor reporting.
- Add a cold preflight that reuses existing doctor checks, reports only failures in a fixed order, limits output to eight items, and distinguishes machine readiness from project wiring.
- Run the preflight for no-argument startup and as an early gate for `project` and `up`; preserve help, version, and completion behavior without imposing Docker readiness.
- Lead `doctor` output with the ranked preflight while retaining its existing detailed report.
- Document the advertised `npx` path and clarify that Bun/Prisma/NATS are generated stack concerns, with NATS conditional on project features.

## Capabilities

### New Capabilities
- `cold-npx-preflight`: Cold CLI invocations report ranked machine prerequisites and project-specific failures accurately before generation or startup actions.

### Modified Capabilities
- None.

## Non-goals

- Installing Docker, Tilt, Bun, or any other prerequisite automatically.
- Changing Bun, Prisma, or NATS defaults or treating them as unconditional machine prerequisites.
- Rewriting doctor, adding dependencies, changing binary installer behavior, or modifying engine/Starlark defaults.

## Impact

- CLI executable and command dispatch: `cli/bin/tdk.js`, `cli/src/cli.ts`, `cli/src/commands/doctor.ts`, and the start points of `project` and `up`.
- New utility and focused unit tests: `cli/src/utils/cold-preflight.ts` and `cli/src/utils/cold-preflight.test.ts`.
- Root and CLI documentation: `README.md` and `cli/README.md`.
- Existing doctor runtime checks should be reused; project-specific NATS and Prisma checks must remain conditional on project configuration.
