# Doctor readiness contract

`tdk doctor` and `tdk doctor --json` use the same readiness decision:

| Exit | Meaning |
| --- | --- |
| 0 | Ready; non-blocking warnings and skipped checks are permitted. |
| 1 | One or more blocking findings, including native Windows boot refusal. |
| 2 | Invalid command arguments or an unexpected check failure. |

`--strict` makes the WSL `/mnt/c` placement check blocking. Native Windows retains the existing WSL2 Ubuntu guidance until real Docker Desktop boot acceptance passes. This change does not establish native Windows boot support.

JSON stdout contains exactly one document: `schemaVersion: 1`, `data: {ready, inProject, checks, ports}`, and `errors`. Each check has `name`, `didPass`, `message`, optional `fix`, `isWarning`, and `isSkipped`. When port planning succeeds, `data.ports` contains `http`, `https`, and `postgres` entries with `requested`, `chosen`, `explicit`, and `reason` fields; when planning fails, `chosen` is `null` and the check explains the failure. Doctor does not persist a port selection. Structured errors contain a `USAGE` or `INTERNAL` code and a message; blocking environment findings belong in checks rather than errors. Diagnostic text goes to stderr. Missing/unknown options exit 2; `--help` exits 0 with normal help text.

`--ping-timeout` accepts a positive safe integer in milliseconds; fractional values, unit suffixes, and zero are rejected before any probes run. Concurrent machine probes always settle before the command exits, including when one check throws.

Migration: invalid timeout previously exited 1, and unexpected errors had no stable doctor contract. CI should now distinguish 1 (fix the environment) from 2 (fix invocation or investigate a check failure). Existing successful and blocking environment exits remain 0 and 1. The new JSON flag is additive; text output remains available.

JSON schema changes are additive within schema version 1. Removing/renaming fields or changing their meaning requires an explicit versioned transition and migration documentation. Consumers should ignore unknown fields and reject unsupported schema versions.

## `--fix`

`tdk doctor --fix` repairs before it checks, so the checks and the exit code describe the state after the repair. It never runs `sudo`.

| Flag | Meaning |
| --- | --- |
| `--fix` | Plan and apply repairs. Asks before each one when stdin is a terminal; without a terminal and without `--yes`, a repair is skipped, not applied. |
| `--dry-run` | List the repairs without changing anything. Requires `--fix`. |
| `-y`, `--yes` | Apply every repair without asking. Requires `--fix`. |

`--dry-run` or `--yes` without `--fix` exits 2.

Repairs available today, both `docker network rm` of a network with no containers attached:

- `scope: "project"`: one of this project's own networks (the exact names `tdk up` creates, from the project name in `tdk.json`).
- `scope: "probe"`: a `tdk_doctor_probe_<pid>` network left by an interrupted doctor run, unless that `pid` is still running.

Networks of other projects, and networks with containers attached, are never planned. Project networks are also skipped while a Tilt runs for the project, because a starting stack creates its networks before any container joins them. Outside a project only probes are repaired.

With `--fix`, `data.actions` is added (additive within schema version 1): an array of `{id, check, scope, command, status, reason}` with `status` one of `planned` (dry run), `applied`, `skipped` or `failed`. A `failed` action makes the report not ready and the exit code 1. Not yet implemented from the original proposal (tdk-landscape/tdk-cli-core#1214): repairs for Tilt/host port collisions, stale Tilt processes, crash-looping containers, disk space and `--scope=machine`.

## Duplicate installs

A `TDK installs` check warns (non-blocking) when more than one distinct `tdk` binary is on `PATH`, naming each path and version.

## Crash-looping containers

A `Crash-looping containers` check (blocking) lists containers of this project, matched by compose project name (`<project>_...` or `<project>-...`), that are `restarting`, or have restarted at least 5 times and either were started in the last 10 minutes or, if stopped, exited non-zero in the last 10 minutes. An old restart count on a container that has been up for a while is not reported. Each finding shows the last 3 log lines (with `.env` secret values redacted) and, when the logs name a known cause (missing database, missing module, port in use, unreachable dependency, missing environment variable, exit 137), a hint in `fix`. It reports only; there is no automatic repair yet. It is skipped when Docker is unavailable or the project has no containers.
