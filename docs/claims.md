# Public claims registry

Public numbers and measured outcomes must link to this registry. Keep the source, conditions, and limits beside every claim. Flisk CLI turns a `service.json` per service into a local Docker stack, with Tilt (the local development tool) watching services and live-updating containers as you code. It is not a deploy tool and not a Compose replacement. Production stays on Helm.

| Claim | Allowed wording | Forbidden wording / source |
| --- | --- | --- |
| 14-service demo | “14 tiny services healthy in 4.6s on a 16 GB M1 after images existed. Not a cold boot.” | “from zero”, “cold boot”, “weeks of integration”. Source: local demo capture; warm start only. |
| 100-service bench | “100 generated `/health` stubs, ~20 lines each, healthy through Traefik in 472s on a clean Ubuntu runner ([run](https://github.com/flisk-sh/flisk/actions/runs/36395860088)). Not an ERP.” | “ERP system”; “100 services still readable” without “fixture”. Images built from scratch. |
| Compose import | “A plain Compose app (a Node API and Postgres) answered 49 s after `flisk import` on a clean Ubuntu CI runner, images pulled and built from scratch, install not counted.” Link the [run](https://github.com/flisk-sh/flisk/actions/runs/40660606705). | “in seconds” or “under a minute” as a general promise; any version without “clean” runner and the app size. Source: `tests/e2e/journeys/compose-import` CI3, one cold run on 2026-10-28; CI repeats it on every pull request. |
| Onboarding | “Designed so `flisk doctor` and `flisk up` replace a setup wiki. Not measured on a hiring cohort.” | “weeks of salary”; “day one” stated as a measured fact. |
| ROI calculator | “Inputs are user-set. Output is arithmetic, not savings.” | Default 5 hours/week presented as typical. |

The only permitted performance wording for the 14-service number includes the existing-images and warm-start caveat. Avoid derived phrases such as “under 5 seconds.”

## Website scenes

The flisk.sh homepage replays captured runs. Each entry says what was run, once, and what was edited. None of these is a benchmark.

### Homepage terminal

The terminal in the homepage hero replays real output from Flisk CLI 1.4.45, shortened and replayed faster than it ran. One run of each scene on an Apple Silicon Mac on 2026-11-09, on a working Docker setup, not a clean machine.

- **Demo scene:** the local-process demo (`flisk demo`, run with `--no-docker`) reported both services ready in 0.8 s, with the package already downloaded. Its site is on port 3001 because 3000 was taken; the screenshot is the page it opened. This demo starts plain `node` processes and does not reload on save.
- **Save scene:** `flisk import` and `flisk up` on a one-service Node app in Docker Compose, then one changed string in its source file. The new response came back 2.9 s after the save. A larger app, or a change to its dependencies, takes longer.

### Agent run

The Start, Check and Fix section on the homepage quotes one run on 2026-11-09, on a two-service app as plain local processes, using only the `flisk mcp` tools. `doctor` passed, `up` started both services, `status` showed both unhealthy, and `logs` named the cause (`DATABASE_URL is not set`). The code was fixed, `down` and `up` restarted the stack, and `status` showed both ready and answering.

In this mode restarting a single service is not available, so the agent stopped and started the whole stack. Restarting one service needs Docker and Tilt.

### Homepage console

The console in the homepage hero is the FliskOS interface, copied unchanged from [flisk-sh/fliskos](https://github.com/flisk-sh/fliskos) (version 0.2.0). On the homepage it reads sample data instead of a local server, so nothing starts on your machine and nothing leaves your browser. Creating projects, running tools and starting agent threads are switched off there.

The sample data was captured on 2026-11-09 from FliskOS and Flisk CLI 1.4.45 running two small projects as plain local processes: the two-service demo app, and a two-service app with `DATABASE_URL` left unset. The doctor results, the log line and the agent thread are real output. Four things were edited: folder paths and the user name are replaced, both projects are shown as running with separate platform ports, the agent thread is shortened to the steps about this project, and Start, Stop, Restart and "Apply the fix" switch between the captured states instead of running anything.

The agent thread is one read-only Claude Code run started from FliskOS, asked why the `api` service was not healthy. It found the cause and proposed a fix. The fix the homepage applies is the one-line change made by hand.

### Fix a bug scene

The Fix a bug tab in the homepage terminal replays one run of Flisk CLI 1.4.45 on 2026-11-09, on a two-service app as plain local processes, with `DATABASE_URL` left unset on purpose. The output is shortened to the lines shown. The commands were run in a terminal and the one-line fix was made by hand, not by an agent. This scene shows what the CLI reports; the agent run above is the one that used the MCP tools.

## Homepage benchmark panel

The chart panel in the homepage hero shows single benchmark runs copied from the result files below. They are not comparable with the 100-service bench in the table: a different machine and setup, and services from the `flisk-erp-system` example repository (tiny services) instead of generated stubs on a clean CI runner. Not an ERP.

| Tab | What it shows | Numbers | Conditions | Source |
| --- | --- | --- | --- | --- |
| Warm start | `flisk up` on a warm machine, seconds until all 8 containers are healthy | three warm runs: 50 s, 38 s, 40 s; golden base build skipped (1.6 to 2.0 s); 0 failed resources | flisk-restaurant-example (Traefik, Postgres), Flisk 1.3.144, macOS arm64, 8 CPUs, 16 GB, Docker 29.8.2; run after a cold start, images and build cache kept | [`tdk-up-warm-start-2026-10-11/summary.json`](benchmarks/results/tdk-up-warm-start-2026-10-11/summary.json) |
| Cold start | `flisk up` from nothing built | 281 s to 8 of 8 healthy; 119.8 s rebuilding the golden base layers; 0 failed resources | same machine; golden layers, service images and build cache removed first; one run, so it can vary | same file |
| Boot | seconds until every service is healthy, 5 to 100 example services | 5: 5.0 s, 10: 8.2 s, 20: 13.6 s, 50: 61.0 s, 80: 82.6 s, 100: 73.9 s; 0 crashes and 0 OOM kills at every tier | Docker Compose mode, 16 GB host, Docker VM 7.75 GiB, one run per tier; host load was 24 at the 80-service tier and 14 at 100, so treat tier-to-tier order as noise | [`container-scale-2026-09-25T22-18-28-371Z.json`](benchmarks/results/container-scale-2026-09-25T22-18-28-371Z.json) |
| Memory | total container memory once settled | 5: 74 MiB, 10: 157 MiB, 20: 309 MiB, 50: 834 MiB, 80: 1.32 GiB, 100: 1.63 GiB (16.7 MiB per service); 107 images, 6.56 GB on disk | same run as Boot; service containers only, no Postgres or Traefik; tiny health-check services use far less than real apps | same file |
| CPU | total container CPU % from `docker stats` | 5: 1.7%, 10: 3.7%, 20: 6.2%, 50: 73.1%, 80: 56.2%, 100: 48.0% | same run as Boot; one sample per tier right after services report healthy, so it is not monotonic | same file |
| Latency | p50 of routed `/health` requests | 5: 2.8 ms, 10: 4.5 ms, 20: 3.1 ms, 50: 6.5 ms, 80: 7.5 ms, 100: 5.6 ms; 100 of 100 answered 200; 0 restarts | same run as Boot; one request routed to each service; single run | same file |
| CLI | median milliseconds per command, 500 services | `flisk version` 499 ms, `flisk --help` 546 ms, `flisk resources` 942 ms (494 ms at 10 services), `flisk stacks` 524 ms; 10 fresh Node processes each | Windows x64, i5-12600KF, Node 24; no containers started; the panel leaves out `flisk status`, which waits on a Tilt probe (Tilt was not on `PATH`) | [`cli-startup-2026-10-06T21-18-27.093Z.json`](benchmarks/results/cli-startup-2026-10-06T21-18-27.093Z.json) |

How to rerun them: [`scripts/benchmark/README.md`](../scripts/benchmark/README.md).

<!-- CI checks public docs against the claims-guard block below (scripts/scores/claims-guard.mjs): change it with the table. “day one” and the ROI default are not machine-checked. “from zero” and “cold boot” are wrong only for the 14-service number, so the 4.6s caveat checks them; the cold-boot benchmarks use the words for what they measured. -->
<!-- claims-guard
forbid: weeks of integration | ERP system | weeks of salary | under 5 seconds
caveat: 4.6s => after images existed | warm start | not a cold boot
caveat: 472s => stub | fixture | not an ERP
caveat: 100 services still readable => fixture
caveat: 49 s => clean | from scratch | CI runner
-->
