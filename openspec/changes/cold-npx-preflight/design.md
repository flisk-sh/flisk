## Context

The package declares Node.js `>=22.12.0`, while its executable currently loads the compiled CLI without enforcing that engine requirement. A bare invocation prints help and exits successfully. Doctor already owns checks for Docker, versions, Tilt, Bun, host ports, and project wiring, so preflight should compose those existing checks rather than duplicate them or replace the detailed doctor report.

The first-run path must be useful without a Flisk project directory. Machine readiness is therefore evaluated independently from project wiring, while NATS and Prisma checks are only included when a detected project enables/requires them. Bun/Prisma/NATS are outputs or features of generated project configuration and must not be described as universal cold-npx prerequisites.

## Goals / Non-Goals

### Goals
- Enforce the package's Node minimum before importing compiled CLI code.
- Present relevant failures in stable causal order, with existing doctor remediation text where available.
- Use one preflight formatter consistently for bare invocation and doctor.
- Stop `project` and `up` before side effects when machine checks fail.
- Keep non-startup commands such as help, version, and completion usable without Docker.

### Non-Goals
- Rebuild the doctor subsystem or change its detailed checks.
- Probe or start NATS without a project, install tools, or change generated stack defaults.
- Gate every CLI command or modify engine files.

## Decisions

### Reuse doctor check implementations

The preflight utility will import and call the existing runtime/doctor checks and format their results into the ranked summary. The implementation must inspect current doctor APIs and project detection rather than assume names from the request. Existing fix text is preserved for Docker, Compose, Tilt, Bun, ports, NATS, and Prisma. Node gets a small semver threshold helper that compares parsed major/minor components against 22.12.0.

### Separate machine checks from project checks

Checks are ordered Node, Docker daemon, Docker Engine/Compose, Tilt, Bun, host ports, NATS broker, Prisma/database. Only failed checks are printed, in that order, up to eight. Project checks are omitted when no project is detected; Prisma is never mentioned for a non-project invocation. The summary header reflects whether failures are machine-level (positions 1–6) or project wiring (positions 7–8). Success copy distinguishes a ready machine without a project from a ready project.

### Keep one shared formatter and narrow command hooks

`runColdPreflight` returns structured status and `formatColdPreflight` renders it. Bare invocation prints the report and a concise command hint. Doctor prints the same report first, then continues its current detailed checks. `project` and `up` call a shared early guard before work begins; other commands are not wrapped. The binary Node guard remains plain JavaScript and executes before loading `dist`.

### Preserve bypass commands

Help, version, and completion paths do not require Docker and will not run the machine readiness gate. Doctor is an explicit diagnostic command, so it reports failures without preventing its detailed report from running. Down may remain ungated as described in the request.

## Risks / Trade-offs

- Doctor checks may currently couple machine checks to project state or throw on missing executables. The preflight should adapt/reuse those APIs and convert missing Docker/Tilt into failed checks rather than uncaught errors.
- Some existing check output may not map cleanly to the requested stable ranking. Keep check execution and presentation separate so display order is deterministic without changing doctor semantics.
- Running the preflight both in command dispatch and inside command actions could duplicate probes. Place hooks once at the earliest reliable action boundary and avoid a second invocation for the same command.
- The executable guard and TypeScript Node check intentionally overlap: one is a hard stop before imports, the other makes the requirement visible in diagnostics.

## Migration Plan

No data migration is required. Existing users retain current command semantics except that bare invocation now reports readiness and `project`/`up` fail early with actionable checks. Documentation clarifies the current npx entry point and prerequisite sequence. Rollback consists of reverting the CLI/docs change; generated projects and engine files are not modified.

## Open Questions

- Confirm actual exported doctor check function names and project detection while implementing; use the repository's real APIs.
- Resolve whether the existing successful doctor output should replace or augment the requested `Environment ready for Flisk` copy, preserving existing success wording where appropriate.
