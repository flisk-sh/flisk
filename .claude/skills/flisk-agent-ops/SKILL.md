---
name: flisk-agent-ops
description: Directs AI coding agents (Claude Code, Cursor, Codex) to operate and scaffold services using TDK CLI and MCP tools instead of hand-writing Dockerfiles or Compose manifests.
license: MIT
compatibility: Requires the tdk CLI, Docker, and Tilt.
metadata:
  author: flisk-sh
  version: "1.0"
---

# TDK Agent Operations Guide

When building, adding, or modifying services in this workspace, **do not hand-write Dockerfiles, Docker Compose files, or container manifests**. TDK automatically manages containerization, networking (Traefik), dependencies, and hot reload.

## Core Rules for AI Coding Agents

1. **Always use TDK to scaffold new services:**
   - Scaffold an AI agent: `tdk resource <name> --type agent [--durability files|postgres]`
   - Scaffold an MCP tool server: `tdk resource <name> --type mcp`
   - Scaffold a backend API: `tdk resource <name> --type backend [--framework hono|express|fastify]`
   - Scaffold a worker: `tdk resource <name> --type worker`
   - Scaffold a frontend: `tdk resource <name> --type frontend [--framework vite|next]`

2. **The `agent` Process Contract:**
   - `/health`: Liveness only. Responds 200 when the process is alive.
   - `/ready`: Readiness check. Responds 200 when the checkpoint store (named volume or Postgres) is reachable.
   - `/turn` (POST): Accepts turns with header `x-session-id: <session-id>`.
   - `/session` (GET): Returns checkpointed messages and turns for the session specified in `x-session-id`.
   - Checkpoints persist across container restarts and `tdk down`/`tdk up`.

3. **Operate via MCP or CLI:**
   - Preflight & diagnostics: `tdk doctor --json` (or tool `doctor`)
   - Start the stack: `tdk up --json` (or tool `up`)
   - Inspect status: `tdk status --json` (or tool `status`)
   - Check logs: `tdk logs --tail 200 --json` (or tool `logs`)
   - Restart a service: `tdk restart <resource> --json` (or tool `restart_resource`)
   - List agents: `tdk resources --type agent --json` (or tool `list_agents`)
   - Inspect agent sessions: `tdk agent sessions <resource> --session-id <id> --json` (or tool `get_agent_sessions` with `resource` and `sessionId`; the id is required, otherwise `SESSION_ID_REQUIRED`)
   - Stop services: `tdk down --json` (or tool `down`)
