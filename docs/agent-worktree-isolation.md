# Agent Git Worktree Stack Isolation Guide

This guide explains how to safely operate multiple autonomous coding agents across **Git worktrees** when using Flisk for local service execution.

---

## The Concurrency Challenge

When deploying multiple coding agents (e.g. Claude Code, Cursor, Codex, Gemini) concurrently on a single repository using Git worktrees (`git worktree add ../agent-feature`), each worktree operates as an independent working directory with its own branch.

However, on stock Flisk, running `flisk up` simultaneously across multiple worktrees of the same project causes:
1. **Container Collisions**: Container names are derived from `.flisk/project.json`, causing the second agent to kill the first agent's containers with `docker rm -f`.
2. **Port Collisions**: Host ingress (80/443), Tilt UI (10350), and service ports (3000/8000) collide with `EADDRINUSE`.
3. **Database Volume Mutation**: Both agents share the same Docker named volume (`<project>_pgdata`), resulting in race conditions and test pollution.

For complete experimental reproduction logs and technical details, see the [Multi-Agent Git Worktree Stack Isolation Report](reports/worktree-isolation-findings.md).

---

## Best Practices for Agents Today

### 1. Scope Project Names Per Worktree
In each agent's worktree, ensure `.flisk/project.json` contains a unique project name:
```json
{
  "project": {
    "name": "my-app-agent-auth"
  }
}
```
This isolates Docker container names (`flisk-my-app-agent-auth-<service>`) and volume names (`my-app-agent-auth_pgdata`).

### 2. Configure Distinct Host Ports
Override the standard Flisk ports in the worktree's `.env` file:
```dotenv
# Worktree Agent 1
FLISK_HTTP_PORT=8080
FLISK_HTTPS_PORT=8443
TILT_PORT=10351
FLISK_POSTGRES_PORT=15433
PORT=3001
```

```dotenv
# Worktree Agent 2
FLISK_HTTP_PORT=8081
FLISK_HTTPS_PORT=8444
TILT_PORT=10352
FLISK_POSTGRES_PORT=15434
PORT=3002
```

### 3. Run Verification Workloads Sequentially
If modifying `.flisk/project.json` or `.env` is undesirable during automated agent runs, configure the orchestration harness to run `flisk up`, verify test suites, and run `flisk down` sequentially per worktree rather than in parallel.
