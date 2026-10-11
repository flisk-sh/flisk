# Proposal: agent-host runtime contract

## Why

Coding agents increasingly run inside Dev Containers, Codespaces, or remote workspaces (VS Code Agent Host, Cursor, Coder, T3 Code) rather than on the developer's machine shell. `tdk doctor` already reports a versioned JSON readiness report and `tdk status --json` a versioned status report, and `tdk-skills` already guides agents. What is missing:

- `doctor` does not recognize Dev Containers, Codespaces, or WebContainers. Inside them it gives a generic "install Docker Desktop" message, or tries to start Tilt where no Docker daemon exists.
- `tdk up` and `tdk down` have no machine-readable output and `up` cannot start a subset of services.
- There is no `logs` command, so agents scrape the Tilt UI.
- There is no published `.devcontainer` that puts `tdk` on PATH with a reachable Docker engine.

## What changes

- Extend `doctor` host detection to Dev Container, Codespaces, and WebContainer (WSL2 detection already exists) and fail closed when `tdk up` cannot work.
- Add `--json` to `up`, `down`, and a new `logs` command; add `--only` to `up`; ensure `status --json` exposes host ports and URLs.
- Add `tdk mcp`, an MCP server wrapping the same implementations.
- Ship a reference `.devcontainer` (Docker-outside-of-Docker) and docs.
- Document WebContainers as unsupported for `tdk up`.
- Do not add a WebContainer runtime, a Tilt-in-browser port, or an IDE plugin.

## Capabilities

- `agent-host-detection`: recognize the host kind and the valid Docker path.
- `devcontainer-feature`: reference Dev Container with `tdk` on PATH.
- `harness-lifecycle-api`: JSON lifecycle commands and an MCP server sharing one implementation.

## Impact

- `doctor` and `up` gain host-aware errors; existing `doctor --json` and `status --json` remain backward compatible (additive fields only, report version bumped per its existing convention).
- Generated stacks and the service.json contract are unchanged.
- `tdk-skills` (separate repo, synced via `scripts/sync-tdk-skills.sh`) needs a follow-up PR.
