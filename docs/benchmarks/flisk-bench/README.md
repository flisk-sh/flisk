# Flisk-Bench

Can an AI fix a broken multi-service app? Flisk-Bench breaks a small Flisk project in one way, hands it to a
player with the sentence a developer would type, and checks the result with Flisk's own JSON output.

```bash
bun docs/benchmarks/flisk-bench/run.ts                                   # every player, every task
bun docs/benchmarks/flisk-bench/run.ts --players nothing,doctor-fix      # no model, about 6 minutes
bun docs/benchmarks/flisk-bench/run.ts --players claude-sonnet --tasks port-clash --out results.json
```

Needs Bun and, for the Claude players, a logged-in `claude` CLI. Nothing starts a container: the checks use
`flisk config verify --json` and `flisk up --dry-run --json`.

## The app

Stack `shop` with two backends: `billing` on port 4000 and `orders` on 4001, where `orders` dependsOn `billing`.
Before a task counts, the runner checks that the healthy project passes it and the broken one fails it.

## Tasks (v0)

| Task | What is broken | The developer says |
| --- | --- | --- |
| `typo-dependson` | `dependsOn: ["biling"]` | `--only orders` does not start billing |
| `dependency-cycle` | billing dependsOn orders too | `flisk up shop` refuses to start |
| `object-dependson` | `dependsOn: {"billing": true}` | `flisk up shop` fails about orders |
| `uppercase-app-name` | `appName: "Orders"` | something was renamed, up fails |
| `port-clash` | orders also on 4000 | the second service says port in use |

A task passes when `config verify` is clean, `flisk up shop` would start, orders still starts after billing and
billing does not wait for orders, plus the task's own rule (orders keeps its name; billing keeps port 4000).

## Players

| Player | What it does |
| --- | --- |
| `nothing` | changes nothing; the control, must score 0 |
| `doctor-fix` | `flisk doctor --fix --yes` |
| `claude-haiku`, `claude-sonnet` | `claude -p` with the prompt, `flisk` on `PATH`, at most 40 turns |

Add a player in `players.ts` and a task in `tasks.ts`.

## Results

First run, 2026-11-10 on a Mac (rows in [`results/flisk-bench-2026-11-10.json`](../results/flisk-bench-2026-11-10.json) for the Claude players):

| Player | Fixed | Tokens | Cost | Time |
| --- | --- | --- | --- | --- |
| Do nothing (control) | 0 / 5 | 0 | $0.00 | 0 s |
| `flisk doctor --fix` | 0 / 5 | 0 | $0.00 | 357 s |
| Claude Haiku | 5 / 5 | 955,318 | $0.28 | 486 s |
| Claude Sonnet | 5 / 5 | 2,913,145 | $1.42 | 1123 s |

The v0 tasks are too easy to separate the models; v1 adds harder breaks and a local model player.
