# Tasks

## 1. Host probe
- [x] 1.1 Detect Dev Container, Codespaces, and WebContainer in `cli/src/commands/doctor.ts` (WSL2 exists); add host kind and `canUp` to the doctor JSON report
- [x] 1.2 Check JSON fixtures for doctor/status additions
- [x] 1.3 `flisk up` fails closed when `canUp` is false, with host-specific remediation

## 2. Reference Dev Container
- [ ] 2.1 Contributor `.devcontainer` with `flisk` on PATH and docker-outside-of-docker (verified manually in a real Dev Container)
- [ ] 2.2 Opt-in template from `flisk project --devcontainer` (default off)
- [x] 2.3 Docs: Agent Host, Codespaces, T3-style servers; WebContainers non-goal

## 3. Harness API
- [x] 3.1 `--json` on `up`, `down`; new `logs` command with bounded `--json` (`--service`, `--tail`, `--since`)
- [x] 3.2 `up --only` (spike: `spike-up-only.md`)
- [x] 3.3 `status --json`: per-service `url`/`containerPort`/nullable `hostPort`, plus stack-level port list
- [x] 3.4 `flisk mcp` sharing command implementations; `up` starts detached, callers poll `status`
- [ ] 3.5 Follow-up PR in tdk-skills to call the JSON/MCP contract

## 4. Verify
- [x] 4.1 `openspec validate agent-host-runtime --strict`
- [x] 4.2 Test: doctor with a fake devcontainer env
- [x] 4.3 Test: webcontainer env does not spawn Tilt
