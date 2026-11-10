# Multi-Agent Git Worktree Stack Isolation — Empirical Investigation & Architecture

**Issue:** [#3406](https://github.com/flisk-sh/flisk/issues/3406)  
**Date:** 2026-11-10  
**Tested on:** Flisk CLI v1.4.47, Docker Engine 29.8.2, macOS Darwin arm64 (Apple M4).  
**Related Issues:** [#3123](https://github.com/flisk-sh/flisk/issues/3123) (guide on running many agents with one stack each), [#3126](https://github.com/flisk-sh/flisk/issues/3126) (guidance suggesting one worktree per agent).

---

## 1. Executive Summary

Can two or more autonomous coding agents (Claude Code, Cursor, Codex, Gemini) concurrently run independent Flisk stacks on the same machine, one per Git worktree, without colliding?

### Verdict: **NO on stock Flisk today without worktree isolation.**

Running `flisk up` simultaneously across multiple Git worktrees of the same repository results in **destructive container termination**, **port bind failures (`EADDRINUSE`)**, and **shared database volume corruption**.

POSITIONING.md and the public website must **not** claim out-of-the-box multi-agent worktree isolation until the scoping architecture specified in this document is fully implemented.

---

## 2. Experimental Reproduction & Collision Analysis

To test concurrent worktree isolation, we initialized a repository with Git worktrees `worktree-agent-1` and `worktree-agent-2` containing an API service (`port: 3456`) and a Redis container service (`port: 6379`).

```
Repository Root
 ├── .git/worktrees/
 │    ├── worktree-agent-1/
 │    └── worktree-agent-2/
 ├── worktree-agent-1/ (.git -> pointer file)
 └── worktree-agent-2/ (.git -> pointer file)
```

### Collision 1: Container Force-Kill via Shared Project Identity
In mixed-runtime and container runs, container names are derived from `project.name` in `.flisk/project.json`:
```typescript
// cli/src/utils/native-container.ts:31
export function nativeContainerName(projectName: string, service: string): string {
  return `flisk-${projectName}-${service}`.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}
```
Because both worktrees inherit the exact same `.flisk/project.json` from git history, both derive container name `flisk-worktree-demo-redis`.

When `flisk up` starts a container service, it executes:
```bash
docker rm -f flisk-worktree-demo-redis >/dev/null 2>&1; exec docker run --name flisk-worktree-demo-redis ...
```

**Observed Failure:**
When Agent 2 starts `flisk up`, it forcibly deletes (`docker rm -f`) Agent 1's running Redis container. Agent 1's supervisor detects SIGTERM on its child process, considers the service killed, and shuts down Agent 1's entire stack:
```text
redis | [flisk] started: docker rm -f flisk-worktree-demo-redis >/dev/null 2>&1; exec docker run ...
redis | 7:signal-handler Received SIGTERM scheduling shutdown...
Stopping local processes...
```

---

### Collision 2: Port Collisions on Host Network (`EADDRINUSE`)
Both Docker mode and native-process mode bind to fixed host ports:

1. **Docker / Tilt Mode**:
   - Ingress reverse proxy (Traefik) binds to host ports **80** and **443**.
   - Tilt dashboard binds to host port **10350**.
   - Platform PostgreSQL binds to host port **15432** (or **5432**).
   - Any secondary `tilt up` or `traefik` process fails immediately with port bind conflicts.

2. **Native / Process Mode**:
   - Each worktree runs local processes bound to the ports configured in `service.json` (e.g. `PORT=3000` or `PORT=3456`).
   - Sibling worktrees attempting to listen on the same port crash with:
     ```text
     Error: listen EADDRINUSE: address already in use :::3456
         at Server.setupListenHandle [as _listen2] (node:net:2008:16)
         at listenInCluster (node:net:2065:12)
         at Server.listen (node:net:2170:7)
     ```

---

### Collision 3: Volume Sharing & Database Mutation
Docker volumes are named after the project:
```typescript
// cli/src/utils/native-container.ts:112
const volumeName = typeof volume.name === "string" && volume.name
  ? volume.name
  : `${options.projectName}_${volume.source}`;
```
Both worktrees point to `${projectName}_pgdata`.
- If Agent 1 runs a database migration or deletes rows, Agent 2's database is immediately mutated.
- When an agent runs `flisk down`, it stops the containers used by other agents.

---

### Collision 4: Process Supervision
`NATIVE_DIR = join(".flisk", "native")` writes supervisor PID and run state (`run.json`) within each worktree's own folder. While process state files are physically separated on disk, the underlying processes crash because of the port and container conflicts described above.

---

## 3. Solution Blueprint: Native Worktree Isolation

To enable multi-agent concurrency across Git worktrees, Flisk requires four architectural primitives:

### 1. Automatic Linked Worktree Detection
In Git, a primary clone contains a `.git/` directory, while a linked worktree contains a `.git` file with a `gitdir:` reference:
```typescript
const stat = statSync(join(projectRoot, ".git"));
const isLinkedWorktree = stat.isFile();
```
The worktree name is derived directly from the `gitdir` target:
```typescript
const match = readFileSync(".git", "utf8").match(/^gitdir:\s*(.+)$/m);
const worktreeName = basename(match[1].trim()); // e.g. "agent-feature-auth"
```

### 2. Scoped Project Naming
When worktree isolation is active (via `FLISK_WORKTREE_ISOLATION=true` or `--worktree` flag), project names become scoped:
```typescript
projectName = `${baseProjectName}-${worktreeName}`
```
- Container names become `flisk-${projectName}-${worktreeName}-${service}`.
- Named volumes become `${projectName}_${worktreeName}_${volumeSource}`.
- Agent 2 never kills Agent 1's containers or mutates its database volumes.

### 3. Deterministic Port Offsetting
To prevent `EADDRINUSE`:
- Worktrees calculate a deterministic port offset (e.g. `+100`, `+200`) based on `FLISK_PORT_OFFSET` or a hash of the worktree name.
- In Docker mode, Traefik, Tilt, and Postgres host ports offset:
  `FLISK_HTTP_PORT=8080`, `FLISK_HTTPS_PORT=8443`, `TILT_PORT=10351`, `FLISK_POSTGRES_PORT=15433`.
- In Native mode, service environment `PORT` expands with the offset.

---

## 4. Workarounds for Agents Today

Until automatic worktree isolation lands in core:
1. **Differentiate Project Names**: In each worktree, update `.flisk/project.json` to have a unique `project.name` (e.g. `my-app-agent1`, `my-app-agent2`).
2. **Assign Distinct Ports**: Set distinct port environment variables or override ports in `.env`:
   - Worktree 1: `PORT=3001`, `FLISK_HTTP_PORT=8001`
   - Worktree 2: `PORT=3002`, `FLISK_HTTP_PORT=8002`
3. **Avoid Simultaneous `flisk up` Without Scoping**: If running unmodified repositories, execute agent verification runs sequentially rather than concurrently.
