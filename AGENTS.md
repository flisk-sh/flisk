# Contributor guidance

TDK runs a local development inner loop on Docker + Tilt. It does not emit Kubernetes manifests by default and does not replace Helm, Kustomize, Flux, or Argo for cluster deployments.

- Do not add Deployment or other cluster-manifest generators without an explicit export command and agreed scope.
- Every generator change must state whether its output is local-only or part of an explicit export.
- Keep cluster deployment policy (replicas, probes, ingress, storage, security, identity, and autoscaling) with the user's Kubernetes workflow.
- Preserve the distinction between tdk doctor environment/service checks and tdk config verify generated-project-file consistency checks.
- New examples, fixtures and e2e checks run database migrations in a `migrator` resource (`appType: migrator`), not from the API's own start-up or entrypoint. They must model Postgres, then migrator, then API, and prove that order through `tdk up`. `tdk doctor` warns when a backend or worker runs a migration command from its start script, Dockerfile CMD or ENTRYPOINT, entrypoint script or source. The opt-in Infisical backend entrypoint still runs `prisma migrate deploy`; the rule is for new work.
- Agent-facing contracts (`llms.txt`, `llms-full.txt`, the AI agents guide) live in `docs/agents/`; keep them there, not in the repo root.
- Read `.claude/memory/MEMORY.md` before opening a PR: it lists verification and CI traps that have already cost reruns. Add a line there when a task teaches you a new one.

## AI coding agent directives

When modifying, adding, or testing services in this workspace:
- **Do not hand-write Dockerfiles, Compose files, or container manifests.** Use the TDK CLI:
  - Create services: `tdk resource <name> --type agent|backend|worker|mcp`
  - Start the stack: `tdk up [stack]` or call the `up` MCP tool
  - Inspect status: `tdk status --json` or call the `status` MCP tool
  - Inspect agent sessions: `tdk agent sessions <resource>` or call `get_agent_sessions`
  - Restart services: `tdk restart <resource>` or call `restart_resource`
  - Check diagnostics: `tdk doctor --json`
- The `agent` resource type manages its own process contract (`/health` for liveness, `/ready` for checkpoint store reachable, session routing via `x-session-id`, checkpoints survive restarts).
- Use `tdk mcp` over stdio (`{ "command": "tdk", "args": ["mcp"] }`) for full MCP stack integration.
- For starter templates, use `tdk project agent-stack` to scaffold a complete multi-agent system with tools, database, and messaging.

