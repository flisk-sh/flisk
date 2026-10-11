# Design: agent-host runtime contract

## Context

TDK generates a Docker + Tilt stack from service.json. Dev Containers (`devcontainer.json`) are the open spec IDEs and agent hosts use. WebContainers are a browser Node isolate with a virtual FS; they have no Docker daemon, Compose, or Tilt.

Existing: `tdk doctor --json`, `tdk status --json`, `tdk resources --json`, WSL2 and native-Windows checks in `cli/src/commands/doctor.ts`, and `up --dry-run`.

## Goals / non-goals

- Goals: one host story for machine, Dev Container, Codespaces, WSL2; one JSON API for agent harnesses; `doctor` that fails closed when Docker is unreachable.
- Non-goals: running the stack in WebContainers; replacing Tilt; a VS Code extension; remote cluster deploy.

## Decisions

1. **Dev Container is a host, not a service runtime.** Services stay sibling containers on the host Docker engine. Default reference uses docker-outside-of-docker (socket mount). Docker-in-docker is unsupported in v1 because Tilt bind mounts and layer cache break; to be confirmed by a spike before the docs claim it.
2. **WebContainers are unsupported.** Detected via `process.versions.webcontainer`; `doctor --json` reports `canUp: false` and `up` exits non-zero without spawning Tilt. A website demo may show topology only.
3. **CLI + MCP, not per-IDE plugins.** Harnesses launch agents that call `tdk`. `tdk mcp` exposes `doctor`, `up`, `down`, `status`, `logs`, `resource_list`, calling the same functions as the commands (no shelling out to itself).
4. **Port contract.** Most services are not published on the host; they are routed by Traefik at `*.localhost`. `status --json` therefore reports `url` (ingress), `containerPort`, and a nullable `hostPort` per service, plus a separate stack-level list (ingress HTTP/HTTPS, Tilt UI, published datastores). `forwardPorts` derives from that list, not from per-service ports.
5. **Long-running commands.** One JSON object fits `doctor`, `status`, `down`. `up --json` reports readiness once and leaves Tilt running; `logs --json` is a bounded snapshot; MCP `up` starts detached and callers poll `status`.
6. **One canUp rule.** `canUp` is false for WebContainers, native Windows without the override, and when no container runtime is reachable. Host kind is otherwise informational.
7. **Additive JSON.** New fields are added to the existing versioned doctor/status reports; no field is renamed or removed.

## Risks

- Socket-mounted Docker gives the Dev Container root-equivalent access to the host; docs must say so.
- Agent Host Dev Container support is experimental; machine `tdk up` must never depend on it.
- Host detection by env var can misfire; `canUp` follows the single rule in decision 6 (host kind only matters for WebContainer and native Windows), and runtime reachability is decided by an actual probe, not by host kind.

## Open questions

- Resolved by the spike (`spike-up-only.md`): `up --only` reuses the Tiltfile focus filter, which already follows `dependsOn`; the CLI validates names and refuses to start a second Tilt.
