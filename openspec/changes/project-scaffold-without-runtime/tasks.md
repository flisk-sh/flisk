## 1. Preflight scopes

- [x] 1.1 Read `cold-preflight.ts`, `project.ts`, `up.ts` and the existing project/preflight tests; list the checks each command needs.
- [x] 1.2 Add the `runtime` and `scaffold` scopes to `runColdPreflight` and `assertMachineReadyOrExit`, with the blocking ID lists in one place.
- [x] 1.3 Skip the Docker, Compose and Tilt probes and the project wiring checks in the scaffold scope, and plan the host ports without inspecting Docker.
- [x] 1.4 Add `detectRuntimePrerequisites` and `formatRuntimeNextSteps` so the runtime can be reported from `PATH` alone, with the existing doctor fixes.

## 2. CLI integration

- [x] 2.1 Run `tdk project` in the scaffold scope.
- [x] 2.2 Print the runtime next-step hint after the project configuration is written, regenerated, or a starter template is cloned.
- [x] 2.3 Keep `tdk up` on the runtime scope with the unchanged ranked failures and fixes.
- [x] 2.4 Leave every other command unchanged.

## 3. Tests

- [x] 3.1 Cover the scaffold scope: the runtime probes are never called and the scaffold scope does not block.
- [x] 3.2 Cover the runtime scope: it still blocks with the ranked failures and their fixes.
- [x] 3.3 Cover `tdk project` with Docker stopped and Tilt missing: the project is created, the template is cloned, and the next-step hint is printed.
- [x] 3.4 Cover `tdk up` with Docker stopped and Tilt missing: it exits 1 with the actionable message.
- [x] 3.5 Cover the blocking path the scaffold scope keeps: without Bun the setup stops with `Project setup blocked. Bun 1.2+ must be installed on PATH.` and writes nothing.

## 4. Documentation

- [x] 4.1 Update `cli/README.md` and `docs/cheat-sheet.md` with the new `tdk project` behavior.
- [x] 4.2 Update `docs/troubleshooting.md` so the cold-start entry states that only `tdk up` is blocked.
- [x] 4.3 Update `docs/ARCHITECTURE.md` with the two preflight scopes.
- [x] 4.4 Correct `docs/ci.md`, which still claimed that `tdk project --yes` exits 1 without Docker and Tilt.

## 5. Acceptance

- [x] 5.1 Confirm `tdk project` succeeds with Docker stopped and Tilt not installed.
- [x] 5.2 Confirm `tdk up` still blocks with the actionable message.
- [x] 5.3 Confirm `tdk doctor` remains available as the explicit readiness check.

## 6. OpenSpec reconciliation

- [ ] 6.1 When the unarchived `cold-npx-preflight` change is archived, split its "Startup commands stop before side effects" requirement so that `project` is gated on the scaffold checks and `up` on the runtime checks.
