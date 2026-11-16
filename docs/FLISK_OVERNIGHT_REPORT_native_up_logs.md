# Flisk overnight report (native-up failure logs): native `up` failures now carry their cause

Branch `feat/mcp-up-readiness` (from `origin/main` a572632646d). Everything below was run on this machine, 2026-11-16.

## 1. Executive summary
When a native (no-Docker) service kept crashing, `flisk up --json` and the MCP `up` tool returned `failures: [{name, reason: "kept exiting; see its output above"}]`. An agent reading JSON has no "above". It now gets the failed service's own last lines in `failures[].logs` and in the error message. One change, with tests and a real MCP stdio journey.

## 2. Areas inspected
`cli/src/mcp/tools.ts` (`startUp`, `buildUpArgs`), `cli/src/utils/up-wait.ts`, `startup-report.ts`, `commands/up.ts`, `native-up.ts`, `native-runtime.ts` (`NativeSupervisor`, `readNativeLogLines`), `native-demo.ts`, `docs/agents/*`.

## 3. Biggest weakness
Native startup failure gave no cause to machine callers. The `up --wait` path already attached `failures[].logs` for Tilt stacks, and the native path did not. Reproduced over MCP: api exits 1 with "FATAL: DATABASE_URL is not set", and the result said only "kept exiting".

## 4. Why it matters
An agent that cannot see the cause guesses, or has to know to call `logs`. The demo's native fallback and every Docker-less project use this path.

## 5. The improvement
`withFailureLogs` (`cli/src/utils/native-up.ts`) reads the last 5 lines per failed service, only from lines written since this start (the logs are appended across runs), folds consecutive repeats to `line (xN)`, caps lines at 400 chars. `runNativeUp` adds them to `failures[].logs`, and to the error message when output was not already printed live (`quiet`). Same `failures[].logs` contract the Tilt path uses. Doctor vs `config verify` untouched. No new flags, no cloud.

## 6. Files changed
`cli/src/utils/native-up.ts`, `cli/src/utils/__tests__/native-up-inprocess.test.ts` (+7 tests), `cli/dist/utils/native-up.{js,d.ts}`, `docs/agents/flisk-for-agents.md`, this report.

## 7. Commits and PR
Commit 2d09e94d36d on `feat/mcp-up-readiness`; PR URL is in the PR itself.

## 8. Commands run
`bun run typecheck`, `bun run lint`, `bunx vitest run` (full CLI), `bun run build`, `bun run check:dist`, and the MCP journey through a stdio client (`mcp-call.mjs`: initialize, then `tools/call`).

## 9. Test results
- typecheck exit 0; lint exit 0.
- `native-up-inprocess.test.ts`: 23/23 pass.
- Full CLI suite: 34 failures, all in `extension-fetch`, `tests/generated/*` and `release-bundle`. A rerun of those groups (22 failures) gave identical counts with my change stashed, so they exist on the base here. Likely this machine's licence/extension state (see memory: licence key traps). Not investigated further.
- `make test-shell` / `make scores`: not run.

## 10. E2E evidence (real MCP server over stdio, 2-service native stack)
1. `up` (api needs `API_SECRET`, unset), `waitSeconds: 40`: `isError:true`, `failures[0].logs = ["FATAL: API_SECRET is not set; the api cannot start (x5)"]`, message repeats it.
2. `logs` tool for api, tail 3: same FATAL lines, with timestamps.
3. Repair (`env.API_SECRET` in api `service.json`), `down`, `up`: ok, urls api 4710 / web 3710 (0.8 s).
4. `curl` health: api `ok`, web `web`. `status`: both `ready`, `readiness.ready: true`.
5. `down`: stopped api, web; both ports closed afterwards.
Before the fix, step 1 returned only the "kept exiting" reason.

## 11. Benchmark
Not run. `scripts/benchmark/agent-with-vs-without/` calls external model APIs and I did not check budget.

## 12. Failures and limitations
- With the default 15 s MCP `up` wait, this failure arrives at about 15.1 s (native retry backoff), so `up` returned `started:true` and the failure was only in the log file. `waitSeconds: 40` gets it. Not changed.
- `resource_restart` on a native stack returns `TILT_NOT_RUNNING`.
- My first journey used `DATABASE_URL`, which `localDatabaseEnv` forces to empty for services with no database dependency, so the repair did not take effect. That was my test design.
- Docker/Tilt paths: not exercised (Tilt `up --wait` logs code is unchanged).
- Demo e2e suite (`tests/e2e/journeys/demo`): not run.

## 13. Work not completed
Docker-backed e2e, `make scores`, demo suite, benchmark.

## 14. Next three improvements
1. MCP `up`: return a pending state with the live failure instead of `started:true` when the log already shows crash loops, or make the default wait cover native retry backoff.
2. `resource_restart` / `resource_run` for native stacks (supervisor-backed instead of Tilt).
3. Tilt/container failures from MCP `up`: attach `logs` the same way, and make `logs --unhealthy` work after a native failure.
