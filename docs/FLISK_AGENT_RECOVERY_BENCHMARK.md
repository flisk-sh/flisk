# Flisk agent recovery benchmark

Question: does Flisk let an AI coding agent start, diagnose, repair and restart a real multi-service app
(frontend, API, PostgreSQL) more reliably than the same agent without Flisk?

**Verdict: PARTIAL, and the evidence does not show Flisk is better.** On this small app, with one run per cell, the
control agent (a plain shell script) recovered from five of six faults about as fast as or faster than the Flisk agent.
The benchmark did find one real Flisk defect (a service's own `DATABASE_URL` was silently blanked), which is fixed and
covered by tests. See section 12.

## 1. Commit and environment

| | |
|---|---|
| Base commit | `ac3b1539ba9` (`fix(resource): reserve ports across concurrent creates (#4023) (#4502)`) |
| Branch | `bench/agent-recovery` |
| Final commit | the head of the draft PR |
| Machine | macOS (Darwin 25.5.0), Apple silicon, local PostgreSQL binaries (`initdb`, `postgres`, `psql`) |
| Runtime tested | Flisk **native** (services with `command`, no Docker, no Tilt). Docker/Tilt mode was **not tested** (see section 11) |
| Agent model | Claude Sonnet (subagents). The same model and the same task text for both arms |
| Local `node` | Bun. `npm` is not installed, so CLI steps ran through `bun run` |

## 2. Test commands and results

Baseline, before any change (`docs/benchmarks/agent-recovery-raw/baseline-vitest.log`): native lifecycle, MCP and
native-up test files, 6 files, **168 tests passed**, exit 0.

Final (all logs in `docs/benchmarks/agent-recovery-raw/`):

| Check | Command | Result |
|---|---|---|
| Typecheck | `bun run typecheck` (in `cli/`) | exit 0 |
| Lint | `./node_modules/.bin/biome check . ../tests/generated ../tests/runtime-layout` | exit 0 (warnings only; first run flagged my formatting, fixed) |
| Full CLI tests | `vitest run` | 7438 passed, 31 failed, 11 skipped (13 of 441 files failed) |
| Build | `bun run build` | exit 0 |
| Scripted recovery, fault G | `harness.mjs scripted` | base: **fail** (up exit 1). Fixed: **pass**, 5/5 e2e steps, no leftovers |
| `make scores` | `make scores` | exit 0 |
| `make test-shell` | `make test-shell` | **not run**: environment (`npm` is not installed here; CI runs it) |
| Docker e2e (`tests/e2e/journeys/demo`) | needs Docker and Tilt | **not run** |

**Failure classification.** The 31 failing tests are in 13 files (`tests/generated/*`, `tests/runtime-layout/release-bundle`,
`backend-languages/node`, `command-specs` (a cold-start timing test), `project-verdaccio-assets-e2e`,
`resource-backend-languages`, `runtime`, `status`, `extension-fetch`, `one-command`, `up-fast-noop`). I re-ran exactly
those 13 files on the unmodified base commit and on the branch: **both give 33 failed / 223 passed in 12 files, with
identical failing test names** (`base-failing-files-vitest.log`, `final-failing-files-rerun.log`). One file passed on
re-run, so it is load-dependent. Classification: **pre-existing (reproduced on the base commit)**, not a regression.
They look environmental (missing network, generated assets, timing), but I did not investigate each one.

## 3. Architecture of the benchmark app

Three services plus a one-shot migrator, all real processes:

- `db`: real PostgreSQL (`postgres/run.sh`), data dir created by `initdb`.
- `migrate`: one-shot, creates database `notes` and table `notes`.
- `api` (`api/server.mjs`): `/health` runs `select 1`; token-guarded `GET`/`POST /notes` run SQL through `psql`. Requires
  `PORT`, `API_TOKEN`, `DATABASE_URL`; reads `config/limits.json`; honours `NOTES_LIMIT`.
- `web` (`web/server.mjs`): serves the notes page and proxies `/api/*` to the API with the token.

The independent grader (`harness.mjs grade`, outside the agent) runs five steps: web `/health`, web serves the page,
POST a note through web to api to db, GET it back, and the row exists in PostgreSQL itself. A watcher polls this and
records the first time all five pass. Boots per service come from `events.log` (each service appends a line when it
starts). Leftover ports and `postgres` PIDs are checked after the agent finishes.

Control arm: a `dev.sh up|down|status` script with pidfiles and logs, written by me. **This is a good script, so the
control is strong.** Treatment arm: Flisk `service.json` files, with the agent allowed the Flisk CLI and the MCP tools
(through a per-call stdio harness).

## 4. Exact task

Given verbatim to both arms:

> Start the application, verify that the frontend can perform a database-backed operation through the API, diagnose and
> repair any deliberately introduced runtime/configuration failure, restart the affected service, and prove that the
> complete application works.

Each agent got its own directory with fixed, unique ports and was not told which fault was injected.

## 5. Failure injection

| ID | Fault | How it is injected |
|---|---|---|
| A | missing API env var | `API_TOKEN` line removed from `.env` |
| B | API crashes at startup | trailing comma in `api/config/limits.json` |
| C | database unavailable at API start | `chmod 755` on the postgres data dir (postgres refuses to start) |
| D | API up but health fails | `DATABASE_URL` points at `notes_prod`, which does not exist |
| E | service restarted while dependants run | stack started with `NOTES_LIMIT=0`; every note is rejected with 409 |
| F | invalid config needing a diagnostic | dependency `migrate` typo'd as `migrat` |
| G | none injected (Flisk arm only) | database service named `db`; used to probe defect 1 |

One fault per run, one run per cell. Round 1 was discarded (section 6).

## 6. Raw results (before the fix, round 2)

"Time to healthy" is from the start of the run until the watcher first saw all five e2e steps pass. "Extra boots" is
the sum over services of (boots − 1), so it counts restarts and crash-loop retries together. Tool calls are tool-use
blocks in the agent transcript (±2: nested calls are counted differently between runs).

| Fault | Arm | Completed | Time to healthy (s) | Tool calls | Extra boots | Leftovers |
|---|---|---|---|---|---|---|
| A | control | yes | 51.6 | 10 | 4 | none |
| A | Flisk | yes | 70.9 | 9 | 7 (api booted 6 times) | none |
| B | control | yes | 52.8 | 11 | 1 | none |
| B | Flisk | yes | 61.0 | 14 | 0 | none |
| C | control | yes | 63.2 | 10 | 4 | none |
| C | Flisk | yes | 80.2 | 9 | 5 (db booted 6 times) | none |
| D | control | yes | 76.1 | 14 | 4 | none |
| D | Flisk | yes | 261.3 | 14 | 3 | none |
| E | control | **NOT COMPARABLE** | — | 4 | — | left running, cleaned by hand |
| E | Flisk | yes | 250.7 | 30 | 8 | none |
| F | control | yes | 136.3 | 9 | 2 | none |
| F | Flisk | yes | 74.7 | 8 | 0 | none |
| G | Flisk | yes | 250.7 | 25 | 47 (api booted 32 times) | none |

Every comparable run ended with the final database operation succeeding (the watcher saw the full e2e pass) and with no
orphaned ports or postgres processes. Agent-reported counts I kept (final JSON of the Flisk agents D, E, G): failed
startups 1 / 0 / 4, restarts 1 / 5 / 1. For the other runs I did not keep the agent's own report, so the file records
`null` rather than a guess. The result file is `docs/benchmarks/agent-recovery-results.json`.

**NOT COMPARABLE runs.**
- *Round 1 (8 runs):* the briefs listed the wrong ports, so agents collided and rewrote `.env`. All were stopped and discarded.
- *Control E:* the agent was blocked by the sandbox rule that denies reading `.env` files. That is an environment limit,
  not a property of the task. The app was left running and I stopped it by hand.
- *Flisk E* is comparable only loosely: I injected the fault through the shell environment of the supervisor, and a
  supervisor's shell environment outranks `.env` by design, so `restart` could not clear it (section 9).

## 7. Before and after the fix

The post-fix round (round 3) re-ran the Flisk arm for A, D and G with a repaired fixture (section 11, item 2).

| Run | Time to healthy (s) | Tool calls | Failed startups (agent) | Restarts (agent) |
|---|---|---|---|---|
| G before | 250.7 | 25 | 4 | 1 |
| **G after** | **19.4** | **12** | **0** | **0** |
| A before | 70.9 | 9 | — | — |
| A after | 55.3 | 12 | 1 | 0 |
| D before | 261.3 | 14 | 1 | 1 |
| D after | 99.2 | 11 | 1 | 0 |

Only G is evidence about the fix. A and D changed because the fixture now carries `.flisk/project.json`, not because of
the code fix, and a single run each is noise-level. Round 3 has no control re-run: the fix does not touch the control
arm. Deterministic confirmation without a model (`harness.mjs scripted`, fault G): the base build exits 1 with the
stack never healthy (16.4 s), the fixed build passes all five e2e steps in 2.6 s, and neither leaves anything behind
(`scripted-G-base.json`, `scripted-G-fixed.json`).

## 8. Tool-call traces

Per-run traces with secrets redacted are in `docs/benchmarks/agent-recovery-raw/runs/<round>-<arm>-<fault>/`:
`mcp-calls.jsonl` (every Flisk MCP call with arguments and the first 4000 characters of the response), `events.log`
(service boots), `timeline.jsonl`, `meta.json`. The control arm's shell commands are not captured as a separate file; its
evidence is `events.log` and the grade. Redaction replaces `API_TOKEN`, `DB_PASSWORD` and `JWT_SECRET` values and the
local user name. All benchmark secrets were throwaway local values.

Trace of the defect (r2 Flisk G, from the agent's own report and `mcp-calls.jsonl`): `up` returns `starting`, api exits
with `FATAL: required environment variable(s) not set: DATABASE_URL` although `.env` and `service.json` both set it,
then web never starts and the supervisor stops the stack including `db`. The agent tried `${DATABASE_URL}`, a literal
value, `--no-database` and dropping `db` from `dependsOn` before it worked around the problem by passing the URL under
another name (`NOTES_DB_URL`) and exporting it inside the command.

## 9. Defects found

1. **Fixed. A service's own `DATABASE_URL` is blanked by `flisk up` (native).** `localDatabaseEnv` in
   `cli/src/utils/native-up.ts` forced `DATABASE_URL=""` for every local service whose `dependsOn` does not name a
   recognised database resource (#4456 added it so a Docker host URL in `.env` does not reach a local process). A
   plain command service called `db`, or any database the Flisk project does not know, is not recognised, so a URL the
   service declared explicitly in its own `service.json` `env` was overwritten with an empty string, with no message.
   The service then died on startup and the whole stack was torn down. Cost to the agent: 4 failed startups and about
   4 minutes. It affects `up` and `restart` (both call the function).
2. **Fixed (warning only): a restart does not override the supervisor's shell environment.** In Flisk E
   the agent set `NOTES_LIMIT=100` in `.env`, `flisk restart api` said ready, but the value stayed `0` because the
   environment of the running `flisk up` process wins over `.env`. The agent needed a full `down` and `up` (5 restarts,
   all services bounced). The order is documented behaviour ("shell overrides .env"), so it is unchanged. `restart` now prints a warning naming (never
   printing the value of) every `.env` key the shell overrides, via `shadowedEnvKeys` in `native-up.ts`, with two unit tests. It was added after the
   measured runs, so no agent run covers it.
3. **Observation, not investigated: crash-loop retries.** With a missing `API_TOKEN` (A) the api booted 6 times and in
   G 32 times before the agent acted. This is the supervisor retrying a crashing service. I did not check whether the
   retry limit or backoff is right.

Two defects are fixed (1 fully, 2 as a warning), the maximum allowed. Defect 3 is left open.

## 10. Fix and tests

Change (`cli/src/utils/native-up.ts`): `localDatabaseEnv` gets an optional third argument, the service's own declared
`env`. When it declares a non-empty `DATABASE_URL`, nothing is blanked. Both call sites (`up` and the restart `reload`)
pass `service.env`. The old behaviour is unchanged for a service that declares nothing (#4456 still holds), so the
signature is backward compatible. `cli/dist/` was rebuilt and is committed.

Tests (`cli/src/utils/__tests__/native-up-inprocess.test.ts`, 25 tests in the file, all pass):
- success path: a declared `DATABASE_URL` survives, with `["db"]` not registered as a database, and with no `dependsOn`;
- failure path: an empty or absent declaration is still cleared (#4456 behaviour kept);
- no secret leak: the helper's result never echoes a declared value that contains a password.

Interruption cleanup: the scripted experiment ends with `flisk down` and a leftover check; the harness asserts no open
ports and no `postgres` PIDs, and that passes on the fixed build. I did not add a new interruption test: the fix does
not change how processes are started or stopped.

## 11. Limitations

- **One run per cell, one model, one small app.** Differences of a few seconds or a tool call are noise. No statistics.
- **The control is strong.** I wrote a careful `dev.sh`; a real agent without Flisk would more often start from nothing.
  The result says "Flisk does not beat a well-made script on a 3-service app", not "Flisk does not help".
- **Faults were fixed at the file level.** Most agents repaired the fault *before* the first start (they read the files
  first), so failed-startup counts are low for both arms and the "restart the affected service" step often did not happen.
- **Fixture gap in round 2:** the Flisk arm lacked `.flisk/project.json`, so every MCP tool failed until the agent ran
  `flisk project --yes`. This inflated the Flisk times in round 2 (for example D at 261 s). Round 3 and later runs of
  `prep` run `flisk project` first. The round-2 numbers are reported as they happened.
- **Native mode only.** Docker and Tilt were not tested, and the e2e suites that need them were not run.
- **Time to healthy** includes the agent's thinking time, not only Flisk's start time.
- **Budget:** subagents ran with the default model budget; no run hit a limit. Control E was blocked by the environment.
- Flisk E's fault came in through the shell environment; that favours the control and shows a real trap, but it is not
  a pure runtime fault.

## 12. Verdict

**PARTIAL — NOT DONE.** What is unmet from the definition of done: the Docker/Tilt mode was not tested, `make test-shell`
could not run locally (no `npm`), Docker e2e suites were not run, and the CI workflow has not yet run on GitHub when
this was written.

What the evidence supports:
- Flisk did **not** make this agent faster or more reliable on faults A–D and F (control was equal or faster in four of
  five comparable pairs; F is the one clear Flisk win, 74.7 s against 136.3 s).
- Flisk's strengths did show: clean shutdown in every run, no orphaned processes, readiness-gated `up` with a
  structured `state`, and failure messages that name the failing service.
- The benchmark exposed a real bug (defect 1) that cost a Flisk-using agent four minutes. Fixed: the same task now takes
  19 s and 0 failed startups.

Does it justify continuing? Yes, but with a better experiment: several runs per cell, a control that starts from no
scripts, a Docker/Tilt arm, and the shell-environment warning (defect 2) as the next small improvement.
