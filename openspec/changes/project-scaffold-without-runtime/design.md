## Context

`flisk project` and `flisk up` share one cold preflight (`cli/src/utils/cold-preflight.ts`). The preflight runs the Docker runtime, Compose and Tilt probes and exits 1 when any machine check fails. `flisk project` calls it before it writes anything, so project setup needs a running Docker daemon and an installed Tilt even though neither is used to write files.

The readiness gate itself is correct for `flisk up`: the local runtime is exactly what starting a stack needs, and the ranked failure list with its fixes is the actionable output the CLI promises.

## Goals / Non-Goals

### Goals

- Let `flisk project` initialize a project and clone a starter template with Docker stopped and Tilt not installed.
- Keep the runtime preflight, and its ranked actionable output, in place for `flisk up`.
- Report the missing runtime as a next step after project setup instead of a failure.
- Keep `flisk doctor` as the explicit readiness check for the whole machine.

### Non-Goals

- Probing the Docker daemon while scaffolding: the scaffold scope must not touch Docker at all.
- Changing what `flisk up` requires, or the wording of its readiness failures.
- Installing anything, or relaxing the Bun requirement of project setup.
- Changing the generated project files, templates or the engine.

## Decisions

### Two scopes on the existing preflight

`runColdPreflight` and `assertMachineReadyOrExit` take a `scope`: `"runtime"` (the default, unchanged behavior) or `"scaffold"`. The scaffold scope skips the Docker, Compose and Tilt probes and the project wiring checks (NATS, Prisma database), because they describe a running stack rather than a directory of generated files. The host port plan is computed without inspecting Docker in the scaffold scope.

The blocking set follows the scope: the runtime scope blocks on Node, Docker, Compose, Tilt, Bun and ports; the scaffold scope blocks on Node, Bun and ports only. The two ID lists (`RUNTIME_CHECK_IDS`, `SCAFFOLD_CHECK_IDS`) keep the report order and the blocking rules in one place.

### The runtime is reported, not required

The next-step hint is built from `PATH` only (`detectRuntimePrerequisites`): it never contacts the Docker daemon, so it works on a machine where Docker is not installed at all. `formatRuntimeNextSteps` names every missing executable with the existing `DOCTOR_FIXES` remediation text and points at `flisk doctor` (readiness) and `flisk up` (start the stack). `flisk project` prints it after the configuration is written and after a template is cloned.

A missing Docker *daemon* is not detected by this hint, because detecting it would mean probing Docker. `flisk up` is the place where that is reported, with the full failure list and its fixes.

### Tests fake the probes, not the machine

The tests mock the doctor check functions and the `PATH` lookup, so they describe "Docker is stopped, Tilt is missing, Bun is installed" without a Docker daemon. The project test asserts that the Docker and Tilt probes are never called during setup, and the `flisk up` test asserts that the same missing runtime still exits 1 with the ranked failures and their fixes.

## Risks / Trade-offs

- The scaffold scope keeps Node, Bun and host ports blocking, so a machine without Bun still cannot run `flisk project`. That is unchanged behavior, and Bun is needed by the generated services.
- A developer whose Docker daemon is stopped sees no warning from `flisk project` itself, because detecting that would require probing Docker. The hint still names the runtime and `flisk doctor`.
- `runColdPreflight` now behaves differently per scope, so every caller has to pick one. The default stays the runtime scope, which keeps the bare invocation and `flisk doctor` unchanged.

## Migration Plan

No data migration is required. `flisk project` becomes usable without the local runtime; `flisk up` is unchanged. Rolling back is a revert of the CLI change.

## Open Questions

- None for this change.
