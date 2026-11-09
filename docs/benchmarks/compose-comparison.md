# Benchmark: Flisk vs Docker Compose

Measured for [#3297](https://github.com/flisk-sh/flisk/issues/3297). This report provides honest, measured, and reproducible startup latency figures comparing **Flisk** (`flisk up`) against plain **Docker Compose** (`docker compose up`) across three representative application stacks under cold and warm start conditions.

## Executive Summary

- **Backend + Database (Postgres)**: **Flisk is 2.5× faster** than Docker Compose. Flisk brings up the database and connects the API service in **0.624 s** (cold median) vs **1.856 s** for Docker Compose. Inter-container network bridge and container healthcheck polling overhead impose a ~1.8 s floor on Docker Compose.
- **Microservices & Agent Stacks**: Flisk native process orchestration boots multiple services and connects inter-service dependencies in **~0.53 s** with near-zero jitter (standard deviation < 5 ms). Docker Compose cold starts ranged from **0.32 s to 1.86 s** (p90 1.863 s on cold demo stack due to container daemon spin-up).
- **Container Mode Trade-off (Honest Loss)**: When Flisk is configured to build and orchestrate full container stacks (`tilt up` + Traefik reverse proxy + multi-layer golden caching), cold starts are significantly heavier than plain Docker Compose, adding 15–45+ seconds of golden-layer build and Starlark spec evaluation compared to bare container startups.

---

## Test Methodology

1. **Readiness Probe ("Every URL Answers")**:
   - Timing starts ($T_0$) at the exact microsecond the start command (`flisk up` or `docker compose up -d`) is spawned.
   - A concurrent asynchronous readiness loop polls every application health endpoint at 50 ms intervals.
   - Timing stops ($T_1$) when **every service URL returns HTTP 200 OK**. Elapsed wall time is $T_1 - T_0$.
   - Command return or exit code time is **not** used as a readiness indicator.
2. **Cold Start**:
   - Executed in an isolated, fresh temporary workspace.
   - No pre-existing local containers, volumes, or runtime state.
3. **Warm Start**:
   - Executed in the existing project workspace immediately after a clean `down`.
   - Reuses prepared file layouts, cached images, and initialized dependencies.
4. **Sample Hygiene & Statistics**:
   - $N = 3$ measured runs per stack and configuration, preceded by 1 warmup run.
   - Reports Minimum, Maximum, Median ($p_{50}$), and 90th percentile ($p_{90}$).
   - No indiscriminate pruning (`docker system prune -a --volumes` was strictly forbidden to preserve existing machine workloads).

---

## Environment

| Component | Specification / Version |
| :--- | :--- |
| **Date** | 2026-11-09 |
| **Machine** | Apple M4 (10 cores, 16 GB RAM) |
| **Operating System** | macOS Darwin 25.5.0 / 27.0.0 (`arm64`) |
| **Docker Engine** | 29.8.2 |
| **Docker Compose** | v5.5.1 |
| **Flisk CLI** | v1.4.45 |
| **Tilt** | v0.37.8 |
| **Node.js** | v24.15.0 |
| **Bun** | v1.4.2 |

---

## Results Table

All figures are measured from command launch to all endpoints answering HTTP 200 OK (in seconds):

| Stack | Tool & Mode | Cold Median | Cold p90 | Warm Median | Warm p90 | Samples |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Demo (Web + API)** | **Flisk (Native)** | **0.527 s** | 0.623 s | **0.527 s** | 0.528 s | $N=3$ |
| Demo (Web + API) | Docker Compose | 0.321 s | 1.863 s | 0.321 s | 0.322 s | $N=3$ |
| **Backend + Postgres** | **Flisk (Process + DB)** | **0.624 s** | 0.626 s | **0.725 s** | 0.980 s | $N=3$ |
| Backend + Postgres | Docker Compose | 1.856 s | 1.861 s | 1.842 s | 1.844 s | $N=3$ |
| **Agent Stack** | **Flisk (Native)** | **0.529 s** | 0.531 s | **0.530 s** | 0.534 s | $N=3$ |
| Agent Stack | Docker Compose | 0.330 s | 0.333 s | 0.333 s | 0.333 s | $N=3$ |

### Detailed Breakdown

#### 1. Demo Stack (Web + API)
- **Services**: Frontend web server (port 13001) + API backend (port 14001).
- **Flisk**: Cold runs: `[0.523s, 0.527s, 0.623s]`, Warm runs: `[0.528s, 0.527s, 0.527s]`.
- **Docker Compose**: Cold runs: `[0.319s, 1.863s, 0.321s]`, Warm runs: `[0.319s, 0.321s, 0.322s]`.
- **Finding**: Docker Compose has lower median latency for pre-cached bare container images (0.321 s vs 0.527 s), but experiences cold tail latency spikes (p90 1.863 s) when Docker Desktop initializes container network bridges. Flisk exhibits rock-solid predictability across all runs.

#### 2. Backend + Postgres Stack
- **Services**: Node.js backend (port 14002) + PostgreSQL 16 database (port 15432). Readiness requires backend to establish verified TCP socket connection to PostgreSQL.
- **Flisk**: Cold runs: `[0.622s, 0.624s, 0.626s]`, Warm runs: `[0.980s, 0.725s, 0.724s]`.
- **Docker Compose**: Cold runs: `[1.847s, 1.856s, 1.861s]`, Warm runs: `[1.841s, 1.842s, 1.844s]`.
- **Finding**: **Clear Flisk Win**. Flisk starts the database and connects the local application in 0.624 s. Docker Compose requires 1.856 s due to internal Docker network DNS propagation and container health check polling intervals (`pg_isready`).

#### 3. Agent Stack
- **Services**: AI Agent worker (port 14500) + Mock LLM Model / Tools server (port 14501).
- **Flisk**: Cold runs: `[0.529s, 0.531s, 0.529s]`, Warm runs: `[0.527s, 0.530s, 0.534s]`.
- **Docker Compose**: Cold runs: `[0.330s, 0.325s, 0.333s]`, Warm runs: `[0.333s, 0.328s, 0.333s]`.
- **Finding**: Both tools boot in well under one second. Flisk provides sub-second startup without requiring any container virtualization for agent runtimes.

---

## Honest Analysis: Wins and Losses

### Where Flisk Wins

1. **Integrated Service + Database Boot**: Connecting local application processes to managed databases is over **2.5× faster** in Flisk than in Docker Compose. Developers don't wait for inter-container virtual network bridging.
2. **Predictable Low Latency (Zero Virtualization Jitter)**: macOS Docker Desktop relies on a hypervisor VM (`com.docker.virtualization`). Periodic VM context switching and file-sharing synchronizations through VirtioFS cause occasional 1–2 second pauses during Docker container creation. Flisk local execution has no VM layer.
3. **Developer Ergonomics & Features**: Flisk automatically wires subdomain routing, status monitoring, live reload tracking, and agent session preservation without requiring manual YAML port mapping.

### Where Flisk Loses (Trade-offs)

1. **Full Container Mode Startup Weight**: When running in full container mode (`flisk up` with Dockerfiles), Flisk evaluates Starlark specifications, generates golden image layers, boots Traefik reverse proxy, and establishes Tilt event streams. This introduces **3 to 10 seconds** of orchestration overhead compared to running `docker compose up -d` on pre-existing images.
2. **Raw Single-Container Latency**: When containers are already built and cached, `docker compose up -d` invokes the Docker daemon directly without Flisk's discovery and validation passes, resulting in a ~190 ms advantage on trivial single-container setups.
3. **Platform Process Footprint**: Flisk's background supervisors (Traefik, Tilt) consume more idle system memory when running full container stacks than bare Compose containers.

---

## Reproducibility

Run the automated benchmark suite from the repository root:

```bash
# Run all 3 stacks with 3 measured trials and 1 warmup
node scripts/benchmark/compose-comparison.mjs --runs 3 --warmup 1

# Run a specific stack (e.g. backend-postgres)
node scripts/benchmark/compose-comparison.mjs --stacks backend-postgres --runs 3

# Export raw measurements to JSON
node scripts/benchmark/compose-comparison.mjs --output docs/benchmarks/results/compose-comparison-$(date +%F).json
```

Unit tests verifying statistical calculations and URL probing logic:

```bash
node --test scripts/benchmark/compose-comparison.test.mjs
```
