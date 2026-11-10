# Shop benchmark

A scripted (no LLM agent) benchmark of one 10-part shop with several local dev tools. It is **informational, not a gate**:
one run per tool, on a CI runner that is not the Colima Mac behind `docs/benchmarks/agent-build-bench-2026-11-10.md`. The
agent-driven bench (how long an agent takes to build the shop) stays a manual job; this covers the deterministic half.

The shop: storefront, admin, catalog / orders / payments APIs, a queue (Redis streams), notifications and fulfilment workers,
Postgres with migrations, one gateway. An order goes `new` → `paid` → `shipped` and records one payment and one notification.

## Run it

```bash
node scripts/bench/run.mjs --list                    # competitors and whether their tool is installed
node scripts/bench/run.mjs --only compose,tilt       # some of them
FLISK_CMD="node cli/bin/flisk.js" node scripts/bench/run.mjs   # all; Flisk from this checkout (build cli first)
```

Output: `bench-results/<time>/results.json` and `report.md` (override with `--out`). Per tool it measures first start to
healthy, an order to `shipped`, stop (and that nothing answers afterwards), restart to healthy with the order kept, and the
wiring counts W1-W7 from the bench doc. On a machine where Docker only mounts some folders (Colima), pass
`--work /path/that/is/mounted`.

CI: `.github/workflows/shop-bench.yml` runs it on pull requests that touch `runtime/`, `cli/src/commands/up*` or `bench/`,
weekly, and by hand. It writes the table to the job summary, updates one pull request comment and uploads the JSON as an
artifact. For a trend, download the weekly artifact into `docs/benchmarks/results/` (CI never pushes).

## Add a competitor in five minutes

1. `mkdir bench/competitors/<tool>` (the id: kebab-case, the same as the folder).
2. Put the shop in that tool's format there. Reuse the code in `bench/shop/` (one folder per service, each with a
   `Dockerfile`; the runner sets `$BENCH_SHOP` to it). The services read `PORT`, `DATABASE_URL`, `REDIS_URL`, `CATALOG_URL`,
   `PAYMENTS_URL`, `ORDERS_URL`, `SHIP_DELAY_MS`; migrations are `bench/shop/db/migrations/*.sql`.
   Copy `competitors/compose/` if the tool takes Compose.
3. Write `bench.json`:

```json
{
  "id": "mytool",
  "name": "My Tool",
  "tool": { "name": "mytool", "version": "mytool --version" },
  "requires": ["docker", "mytool"],
  "setup": "optional, untimed, runs once in the work folder (generate files here)",
  "start": "mytool up",
  "stop": "mytool down",
  "purge": "mytool down --volumes",
  "clean": "optional, removes leftovers before the first start",
  "env": { "SOME_TOOL_PORT": "${BENCH_PORT2}" },
  "base": "http://localhost:${BENCH_PORT}",
  "health": ["http://localhost:${BENCH_PORT}/health"],
  "paths": { "orders": "/api/orders" },
  "timeoutSeconds": 900,
  "wiring": { "configFiles": ["mytool.yaml"] }
}
```

| Field | Meaning |
| --- | --- |
| `requires` | commands that must exist, else the tool is reported as skipped (not failed) |
| `start` | run in the background, so a command that never returns (`tilt up`) is fine; the clock stops when every `health` URL answers 2xx |
| `stop` | timed; afterwards no `health` URL may answer. A stop that leaves the app running is reported |
| `purge` | final cleanup, also removes data and images this run built |
| `base`, `paths` | where the gateway is. Defaults: `/api/products`, `/api/orders`, `/api/payments`, `/api/notifications`, `/`, `/admin/`. A path that starts with `http` is used as is (a tool that routes APIs on another host) |
| `wiring.configFiles` | globs (relative to the work folder) of the hand-written run/infra config, for W4, W5, W7. Optional `waitsOnHealthy` and `healthChecks` regexes replace the defaults |

Commands run with `sh -c` in a copy of your folder, with `BENCH_PORT` (the gateway), `BENCH_PORT2..4` (spare free ports),
`BENCH_DIR`, `BENCH_SHOP`, `BENCH_ID` and `BENCH_PROJECT` (a unique name for Compose projects and images) in the environment.
Use these ports, never a fixed one: other projects hold the usual ones. `${BENCH_PORT}` also works inside `base`, `health`,
`paths` and `env` values.

4. `node scripts/bench/run.mjs --only mytool`, fix what the report's *Problems* section says.
5. If the tool needs an install step in CI, add it to `.github/workflows/shop-bench.yml` (a `requires` command that is
   missing just skips the tool, so the workflow does not break for tools that are not installed yet).

Nothing else lists the tools: the runner reads `bench/competitors/*/bench.json`. A folder without a `bench.json` is ignored
(see `competitors/encore/README.md`, the documented stub).

## Wiring counts (W1-W7)

Counts, not verdicts, read from files. The shared shop code is the same for every tool, so W1, W2, W6 move only if a tool's
own files add something. W3 (secret literals) is the plain Postgres password the Compose files carry. W4, W5, W7 count the
tool's config files, so they measure how much a tool makes you write. Regexes live in `scripts/bench/lib.mjs`.

## Known limits

- One run per tool and a warm Docker image cache unless the machine is fresh, so "first start" is not always a cold start.
- The shop code is shared Bun code, so Flisk builds it through its own golden images and Compose builds plain Dockerfiles.
- Encore is a documented stub; Nitric, Skaffold, DevSpace, Garden and Aspire are not here yet.
