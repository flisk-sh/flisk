# Docker Compose Real-World Import Validation & Findings

**Issue:** [#3299](https://github.com/flisk-sh/flisk/issues/3299)  
**Date:** 2026-11-10  
**Tested with:** Flisk CLI v1.4.47, `flisk-import` v0.18.2, Docker Engine 29.8.2, Docker Compose v5.5.1 on macOS Darwin arm64 (Apple M4).  
**Target:** Validate `flisk import` against real-world, open-source multi-service Docker Compose projects, identifying what imports cleanly, what is approximated or dropped, and what requires manual adjustment.

---

## 1. Executive Summary

`flisk import` translates existing `docker-compose.yml` stacks into Flisk's `service.json` manifests and `.flisk/project.json` layout without manual authoring.

To measure real-world fidelity and failure boundaries, we tested `flisk import` across three diverse, production open-source architectures, plus targeted synthetic edge cases:
1. **Paperless-ngx** (Document management: Webserver + Valkey 9 broker + PostgreSQL 18 database + bind mounts + environment files).
2. **Supabase** (Backend-as-a-Service: 11 distinct microservices, Envoy API gateway, GoTrue auth, PostgREST, Realtime, Storage, Postgres Meta, Postgres 17, and Supavisor connection pooler).
3. **Outline** (Team knowledge base: Node app infrastructure with Postgres + Redis, container user overrides, and explicit loopback bindings).
4. **Edge Cases**: Bind mounts outside project root, YAML anchors/aliases, multi-stage build targets, network modes, and healthchecks.

### High-Level Verdict

| Real-World Project | Services | Import Status | Flisk Doctor Status | Manual Adjustment Needed |
|---|---|---|---|---|
| **Paperless-ngx** | 3 (`webserver`, `db`, `broker`) | **Clean** | **Passed** | None to pass doctor; optional: change `0.0.0.0` extraPorts bind to loopback. |
| **Supabase** | 11 (`api-gw`, `auth`, `db`, `functions`, `imgproxy`, `meta`, `realtime`, `rest`, `storage`, `studio`, `supavisor`) | **Clean** | **Passed** | Populate `.env` with required secrets (JWT, passwords) that were declared without literal defaults in Compose. |
| **Outline** | 2 (`postgres`, `redis`) | **Clean** | **Passed** | None; container users (`postgres:postgres`, `redis:redis`) and loopback ports preserved. |

---

## 2. In-Depth Project Case Studies

### 2.1 Paperless-ngx (`docker-compose.postgres.yml`)

Paperless-ngx is a widely deployed document archive with a Python web backend, Valkey message broker, and PostgreSQL database.

#### Input Compose Architecture
- `broker`: `docker.io/valkey/valkey:9-alpine`, named volume `redisdata:/data`.
- `db`: `docker.io/library/postgres:18`, named volume `pgdata:/var/lib/postgresql`, environment credentials.
- `webserver`: `ghcr.io/paperless-ngx/paperless-ngx:latest`, `ports: ["8000:8000"]`, `depends_on: [broker, db]`, `env_file: [docker-compose.env]`, bind mounts for `./export` and `./consume`.

#### Import Execution
```bash
flisk import . --yes
```

#### Results & Findings
- **Cleanly Imported:**
  - All 3 services generated valid `service.json` files under `services/<project>/`.
  - Service `broker` and `db` marked as `exposeViaProxy: false` since they are internal infrastructure.
  - Named volumes were automatically prefixed with the project name (`<project>_redisdata`, `<project>_pgdata`).
  - Relative bind mounts (`./export`, `./consume`) were rewritten to maintain path correctness from the service directory (`../../../export`, `../../../consume`).
  - `POSTGRES_PASSWORD` was extracted into `secrets.required: ["POSTGRES_PASSWORD"]` and copied into `.env`.
- **Approximated / Notes:**
  - `healthCheckPath: "/"` was assumed for `webserver`: Compose did not specify an HTTP health path, so Flisk inferred `/` and printed an informative warning.
  - `port: 4000` (Valkey) and `port: 4001` (Postgres) were assigned automatically because Compose declared no host `ports:`.
- **Validation (`flisk doctor`):**
  - Running `flisk project --yes` followed by `flisk doctor` passed completely:
    - `✓ No Postgres 18+ image mounts its volume at /var/lib/postgresql/data` (Paperless mounts to `/var/lib/postgresql`).
    - `✓ Every bind mount stays inside the project`.
    - `✓ Doctor passed. Next: flisk up`.

---

### 2.2 Supabase (`docker/docker-compose.yml`)

Supabase is an 11-service production stack featuring multiple languages (Go, Elixir, Node.js, C++ Envoy, SQL) and complex cross-service dependencies.

#### Input Compose Architecture
- 11 services: `api-gw`, `auth`, `db`, `functions`, `imgproxy`, `meta`, `realtime`, `rest`, `storage`, `studio`, `supavisor`.
- Complex `healthcheck` commands using `CMD-SHELL` with `node -e "fetch(...)"` or `curl`.
- Multiple published ports, container names (`supabase-db`, `supabase-studio`), and variable references.

#### Import Execution
```bash
flisk import . --yes
```

#### Results & Findings
- **Cleanly Imported:**
  - Successfully parsed all 11 services and created `.flisk/project.json` and 11 `service.json` manifests.
  - `depends_on` dependencies (`db`, `api-gw`, `studio`) accurately reflected in `dependsOn`.
  - Composite multi-command health checks in Compose were captured cleanly in `healthCheck.command`.
- **Dropped with Notice:**
  - `container_name` was dropped across all 11 services (`supabase-studio`, `supabase-db`, etc.):
    *Reason:* Flisk names containers deterministically (`flisk-<project>-<service>`) and provisions DNS names matching service names.
  - `mem_limit` on `functions` was dropped:
    *Reason:* Flisk prioritizes fast development iterations over host memory caps.
  - `supavisor` declared multi-ports (`5432` and `6543`). Because no single primary HTTP port exists, Flisk kept both published via `extraPorts`.
- **Validation (`flisk doctor`):**
  - `flisk project --yes` followed by `flisk doctor` passed:
    - `✓ 152 reachable Starlark files have valid load exports and paths`.
    - `✓ All resources are covered by discovery.paths ["services/*/*"]`.
    - `✓ Doctor passed. Next: flisk up`.

---

### 2.3 Outline (`docker-compose.yml`)

Outline provides a minimal local Docker Compose file for database (`postgres`) and cache (`redis`) services.

#### Input Compose Architecture
```yaml
services:
  redis:
    image: redis
    ports: ["127.0.0.1:6379:6379"]
    user: "redis:redis"
  postgres:
    image: postgres
    ports: ["127.0.0.1:5432:5432"]
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: outline
    user: "postgres:postgres"
```

#### Results & Findings
- **Cleanly Imported:**
  - Both services mapped with `ports` published on `127.0.0.1`.
  - `container.user: "postgres:postgres"` and `container.user: "redis:redis"` were preserved directly into `service.json`.
  - `exposeViaProxy: false` was set automatically because 5432 and 6379 are database/broker ports.

---

## 3. Failure Boundary & Edge Case Analysis

| Compose Construct | Example Pattern | Importer Behavior | Evaluation |
|---|---|---|---|
| **YAML Anchors / Aliases** | `x-env: &env ... <<: *env` | **Supported** | Anchors are resolved in-memory during YAML parsing; values merge cleanly. |
| **Custom Dockerfile & Build Context** | `build: { context: ./app, dockerfile: Dockerfile.custom }` | **Supported** | `buildContext` and `dockerfile` are mapped; service is scaffolded in `./app`. |
| **Build Args** | `build: { args: { BUILD_VAR: "123" } }` | **Supported** | Mapped to `buildArgs: { BUILD_VAR: "123" }`. |
| **Multi-Stage Build Target** | `build: { target: development }` | **Dropped** | `target:` is not translated into `service.json`; builds default to the final stage. |
| **Host Mounts Outside Project** | `volumes: ["/var/run/docker.sock:/var/run/docker.sock"]` | **Rejected / Dropped** | Skipped with note: *outside the imported directory*. Flisk blocks mounts escaping project root for security. |
| **Network Mode: Host** | `network_mode: host` | **Dropped** | Skipped with note: *network_mode "host" is not translated*. Flisk only shares another service's network (`sidecarOf`). |
| **Deploy Resource Limits** | `deploy: { resources: { limits: { cpus: '2', memory: '1G' } } }` | **Supported** | Translated to `container.cpus: 2` and `container.memory: "1G"`. |
| **Multiple Container Ports** | `ports: ["8080:80", "9090:9090/udp"]` | **Supported** | Primary HTTP port routed; UDP / extra ports preserved in `extraPorts` with `protocol: "udp"`. |
| **Missing `services:` Map** | Invalid / 404 YAML file | **Refused** | Clear actionable message: `no services: map; Nothing to import`. |

---

## 4. Recommendations for Flisk Importer

1. **Multi-Stage Build Targets (`target:`)**:
   Add `target` support to `service.json` under `buildTarget` or `container.buildTarget` so services utilizing development stages (e.g., node test/dev stages) do not build production release stages.
2. **Post-Import Readiness Guidance**:
   After `flisk import` completes, remind developers to run `flisk project --yes` before running `flisk doctor`, as master Starlark configurations are required for container orchestration.
3. **Database Port Clarity in Mixed Mode**:
   When an imported database declares no host ports, `flisk import` assigns private port 4000/4001. In local-process mixed runs, connecting to `localhost:5432` vs `localhost:4001` should be explicitly documented or default to the well-known database port.
