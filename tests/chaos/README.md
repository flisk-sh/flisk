# Chaos tests

Three tiers that attack how Flisk reads `service.json`, each cheaper and bigger than the one below it:

| Tier | Command | What it does | Scale |
| --- | --- | --- | --- |
| Gates (`gates/`) | `bun run chaos:gates` | generates good and corrupted `service.json` sets and runs them through the checks that stop `flisk up`; each corruption class has a known right verdict | 50,000+ sets a second, 100,000,000 in about 45 minutes |
| Graph (`graph/`) | `bun run chaos` | random `dependsOn` edits, each followed by a look through Tilt, `flisk up` and `flisk config verify`, compared with a reference model | a few hundred edits a minute |
| Docker (`docker/`) | `bun run chaos:docker` (add `--service storefront` for a frontend, `--service mailer` for a worker) | changes one field to a good or bad value, and for each value `flisk up` accepts, runs the generated Tiltfile, `docker compose config` and `docker buildx build --check` | about 150 values, minutes |
| CLI (`cli/fuzz.ts`) | `bun run chaos:cli` | runs every command that is safe offline with random arguments against a valid project, no project, a corrupt `project.json` and a corrupt `service.json`; checks it ends with exit 0, 1 or 2, prints no runtime stack trace, keeps `--json` stdout to one envelope that agrees with the exit code, and prints no `[object Object]`/`NaN` | about 15 runs a second; 25,000 runs found the `networks` crash on a corrupt `project.json` |
| State (`cli/state.ts`) | `bun run chaos:state` | applies random create, delete, rename, copy, port-clash and truncate edits to one project; after each step `resources`, `stacks`, `config regenerate` (twice, must be idempotent), `config verify` and `up --dry-run` must agree with the disk | 30 sequences, minutes |
| MCP (`cli/mcp.ts`) | `bun run chaos:mcp` | starts `flisk mcp`, calls every tool with arguments built from its input schema and then corrupted, against a valid, a corrupt and a missing project; the server must stay up, answer every call once and print no stack trace | 450 calls in about a minute; found `up` with a missing `projectPath` killing the server |

The graph tier is described below. The gates tier needs nothing but Bun. The Docker tier needs `tilt`, Docker with Compose
and Buildx; it builds no image and starts no container (the Dockerfile's base images are replaced by a local image through
`--build-context`, and only the Dockerfile is checked).

`gates/bulk.ts` exits 1 when a gate crashes, refuses a valid set, or lets through a corruption `flisk up` is meant to refuse.
`docker/run.ts` exits 1 when `flisk up` accepts a value that then breaks in Tilt, Compose or the Dockerfile, or refuses a valid
one; add a value to `docker/variants.ts` when a user reports one.

## Graph tier

Stateful property tests ([fast-check](https://fast-check.dev) model-based runs) for the `dependsOn` graph: edit
`service.json` files the way a developer does between two `flisk up`s, and after each edit check that every consumer of
`dependsOn` agrees with a reference model.

```bash
cd tests/chaos
bun install
bun run chaos              # the scenarios, then 4 random edit sequences (about 2 minutes)
bun run chaos:scenarios    # only the recorded scenarios
```

Needs `tilt` on `PATH` (the suite is skipped without it; `FLISK_REQUIRE_TILT=1` makes that an error). Nothing starts a
container: Tilt only executes the generated Tiltfile (`tilt alpha tiltfile-result`), and the CLI runs with `--dry-run`.

## What it checks

`graph/model.ts` says what the graph should be, following the service schema: an entry is a service or a stack name,
the listed services start first, a self entry is no edge. After each `check` step, `graph/invariants.ts` compares the model
with:

| Oracle | Command | Invariants |
| --- | --- | --- |
| Tilt graph | `tilt alpha tiltfile-result` on `.flisk/.flisk-out/Tiltfile` | `resource_deps` between services match the model; a cycle makes Tilt refuse; every service has a resource; the edit is in a watched file, so a running Tilt reloads |
| Tilt focus | the same, with `--focus=<service>` as `flisk up --only` passes it | Tilt enables exactly the service and what it depends on |
| `flisk up` | `flisk up --only <service> --dry-run --json` | starts the model's closure; refuses a cycle; mentions an unknown entry it drops |
| `flisk config verify` | `flisk config verify --json` | reports every unknown entry and every cycle; never calls a valid entry unknown |
| warm vs cold | Tilt graph of a fresh copy with regenerated `.flisk/.flisk-out` | the edited project and a fresh one give the same graph |

The model is never compared with an oracle's own idea of the graph, so a mistake two consumers share still fails.

## Steps

`graph/steps.ts`: `addDep`, `removeDep`, `setDeps`, `addService`, `removeService`, `moveStack`, `check` and `coldCheck`.
Entries come from real service names, stack names, `postgres`, and junk (a typo, a stale name, a near miss).

## Scenarios and known gaps

Each file in `graph/scenarios/` replays a fixed sequence with every gap off and lists the invariants it breaks in `expect`. They
are the regression tests of everything the chaos runs found: all are `[]` now, so any of them failing is a regression.
`KNOWN_GAPS` in `graph/invariants.ts` is where a bug that is real but not yet fixed goes: the random runs tolerate it and its
scenario lists the invariant, so the runs keep looking for new problems. It is empty today.

A random failure prints the steps as a scenario. Save it in `graph/scenarios/` with a title, a `why` and the ids it breaks
(`[]` once fixed), so the case stays covered. `CHAOS_SURVEY=1 bun run chaos -t survey` runs many sequences with every gap on and
lists each distinct violation with the shortest sequence that shows it.

## Knobs

| Variable | Default | Effect |
| --- | --- | --- |
| `CHAOS_RUNS` | 4 | random sequences |
| `CHAOS_STEPS` | 10 | most steps per sequence |
| `CHAOS_SEED` | random | replay a run (fast-check prints the seed on failure) |
| `CHAOS_SHRINK` | off | `1` shrinks a failing sequence (slow: each try re-runs Tilt) |
| `CHAOS_STRICT` | off | `1` runs the random sequences with every gap off |
| `CHAOS_KEEP` | off | `1` keeps the generated projects and prints where |
| `FLISK_BIN` | `cli/bin/flisk.js` | the CLI to test |

## Method

The skill `.claude/skills/flisk-bug-hunter/SKILL.md` describes how to choose a tier, write an oracle that does not cry wolf, bucket findings, prove each by hand and fix it with a test. Reports are written to the temp directory (`CHAOS_REPORT_DIR` to change it), never into the checkout.
