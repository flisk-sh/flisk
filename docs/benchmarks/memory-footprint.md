# Memory footprint

How much memory a running stack takes while idle, so you know what to expect on a laptop and what to switch off. Measured with [`scripts/benchmark/memory-footprint.mjs`](../../scripts/benchmark/memory-footprint.mjs), which samples `docker stats` for every container of a project and splits infrastructure (Postgres, Traefik, NATS, ...) from app services.

## Measured

| Stack | Profile | Infrastructure | App services | Total | Containers | Machine | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Restaurant demo (`npx @flisk-sh/flisk demo`, six services) | default | 133.9 MiB | 68.7 MiB | **202.6 MiB** | 8 | Docker 29.5.2, 4 CPUs, 7.7 GiB, macOS | [json](results/memory-footprint-flisk-restaurant-example-default-2026-10-31.json) |

Idle means the stack has been up for a while with no traffic: the median of three samples five seconds apart. Postgres is most of the infrastructure (107 MiB of the 134). A build or a request burst uses more for a while.

## Keeping the default run small: profiles

A heavy service that is not needed every day (an admin UI, dashboards, a workflow engine) can list `profiles` in its `service.json`:

```json
{ "appName": "admin-ui", "appType": "frontend", "stack": "shop", "port": 3100, "profiles": ["admin"] }
```

`flisk up` then leaves it out and says so:

```text
Not starting admin-ui (profile admin): add --profile <name> to start them
```

`flisk up --profile admin` starts it too, and `flisk up --only admin-ui` starts it whatever its profiles. A service without `profiles` always starts. A `--profile` name no service declares is refused with the list of the project's profiles. See [`profiles`](../service-json.md#ports-runtimes-and-providers) in the `service.json` reference.

## Measuring your own stack

Start the stack with the profiles you want to compare, let it settle for a minute, then:

```bash
node scripts/benchmark/memory-footprint.mjs --project <project name> --profile default
flisk up --profile admin
node scripts/benchmark/memory-footprint.mjs --project <project name> --profile admin
```

`<project name>` is `project.name` in `.flisk/project.json`. Each run prints a table and writes `docs/benchmarks/results/memory-footprint-<project>-<profile>-<date>.json` (`--output` to put it elsewhere, `--samples` and `--interval` to change the sampling).
