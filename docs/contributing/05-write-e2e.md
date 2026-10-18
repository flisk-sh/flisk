# 5. Write an end-to-end test

An end-to-end (e2e) test runs the real `tdk` against a real stack: Docker, Tilt, Traefik and the generated files. Unit tests cannot catch a broken route, a container that never gets ready, or a JSON envelope that a real error turns into a stack trace. An e2e test can.

This page explains when you need one, where it goes, how to write it, and how to prove it works. The [agent suite](../../tests/e2e/resource-types/agent/run.sh) is the worked example throughout. AI assistants can follow the same steps with the `tdk-e2e-author` skill (`.claude/skills/tdk-e2e-author/`).

## Do I need one?

Add or extend an e2e test when your change:

- adds a resource type, or changes what a type scaffolds or how it runs;
- adds a command or an MCP tool that talks to a running stack (`tdk agent sessions`, `tdk restart`, `get_agent_sessions`);
- changes `tdk up`, `tdk down`, Traefik routing, or the engine's generated Compose and Tilt files;
- adds a backend language, a backend or frontend framework, or another provider that users pick with a flag.

You do **not** need one for a change that never starts a stack, such as flag parsing, `--json` formatting with mocked input, or a generator's text output. Those belong in the unit tests under `cli/src/**/__tests__/`. Tests that spawn the CLI against a temporary project without booting a stack (the `*-e2e.test.ts` files) are the `cli-integration` group and stay in vitest.

## Pick the group

Every live-stack suite lives at `tests/e2e/<group>/<suite>/`, in exactly one group, chosen by what it proves:

| Group | It proves | Example |
|---|---|---|
| `resource-types` | one resource type works on a real stack | `resource-types/agent` |
| `journeys` | a multi-command user flow | quickstart, smoke runner, dev loop, cold start |
| `examples` | a real example app boots and serves its routes | the default example, saas-starter |
| `platforms` | a host environment | `platforms/windows`, `platforms/windows-binary`, `platforms/wsl2` |
| `scale` | a large fixture or a benchmark | the 100-service ERP fixture |

Adding an MCP tool that reads a running agent? It belongs in the `agent` suite (or the `mcp` suite for MCP resources). Copy the shape of cases C1 to C3.

Only `resource-types/agent` has moved so far. The other e2e tests still live in `.github/workflows/*-e2e.yml`, `scripts/e2e/`, `scripts/verify-*.sh` and `tests/e2e/*.test.sh`. They move one suite per pull request, as [`openspec/changes/organize-e2e-suites`](../../openspec/changes/organize-e2e-suites/tasks.md) describes. If your change touches one of those, extend it where it is now, or move it first.

## Anatomy of a suite

A suite is a folder with two files:

```text
tests/e2e/resource-types/agent/
├── run.sh       one shell function per case, plus small helpers specific to this suite
└── suite.json   group, name, the paths that select it on a pull request, its cases in CI order, triggers, timeout, secrets
```

`run.sh` starts the same way in every suite:

```bash
SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init agent agente2e      # suite name, scratch project name
STACK=shop
AGENT=bot
RESOURCES=("$AGENT")         # whose container logs `diagnostics` collects

A1() { ... }                 # one function per case
e2e_main "$@"                # list | self-check | all | diagnostics | cleanup | <case>...
```

`suite.json` for the agent suite:

```json
{
  "group": "resource-types",
  "suite": "agent",
  "description": "The agent resource on a live stack: ...",
  "paths": ["cli/src/commands/agent.ts", "cli/src/mcp/**", "engine/**", "tests/e2e/resource-types/agent/**"],
  "cases": ["D1", "D2", "D3", "A1", "A2", "..."],
  "triggers": ["pr", "nightly", "release", "manual"],
  "timeoutMinutes": 30,
  "needsSecrets": []
}
```

`make test-shell` runs `tests/e2e/lib/validate-suites.mjs`, which fails on a misspelled key, a folder that does not match `group` and `suite`, a non-executable `run.sh`, or a case listed in `suite.json` that `run.sh` does not define. A suite that `needsSecrets` cannot have the `pr` trigger, because pull requests from forks get no secrets. A `scale` suite cannot have it either.

## Rules every case follows

These rules come from real failures in the agent suite. Each one cost a red CI run before it was a rule.

1. **One named function per case.** CI runs each case as its own step, so a red run names one behavior, and you can rerun one case by hand.
2. **Each case sets up its own preconditions.** Do not rely on what an earlier case left behind. In CI order, B0 stops the agent and B1 to B7 leave it stopped, so A7 restarts it before writing its turn. Running `run.sh A7` on its own must work too.
3. **Wait with `poll_until`, never `sleep`.** It takes a description and a deadline. When the deadline passes it prints what it waited for, the tail of `up.log` and `docker ps`.
4. **After a restart, wait for a *replaced* container.** The old container keeps answering `/ready` until Tilt swaps it, so readiness alone proves nothing. Use `wait_restarted <resource> <container id before>` and then a readiness check.
5. **A request that a later assertion depends on must fail on a non-2xx status.** Use `traefik_request_ok`. Without it, Traefik's `404 page not found` passed as an agent reply, and a later check blamed the agent for losing data.
6. **A JSON failure prints exactly one envelope.** `assert envelope <file> <CODE>` checks that stdout is one line holding one parseable envelope with that error code, `data: null`, and no stack trace.
7. **Show the evidence.** `run <name> <tdk args>` prints the command, its stdout and stderr, its exit code and its time, so the CI log is the proof. Check `$RC` yourself: `run` never aborts the case.

## Shared helpers

`tests/e2e/lib/` holds everything that is not specific to one suite. Do not copy a helper into your suite. If you need a new one, add it to the library with a unit test.

| Helper | What it does |
|---|---|
| `e2e_init`, `e2e_main` | set up `$DIR`, `$OUT`, `$ARTIFACTS`, `$READY_TIMEOUT`; dispatch `list`, `self-check`, `all`, `diagnostics`, `cleanup` and cases |
| `run`, `run_in` | run `tdk` in the scratch project (or another directory), record output, `RC` and `ELAPSED_MS` |
| `poll_until` | bounded wait with a description |
| `assert envelope / check / equal` | JSON assertions (`assert-json.mjs`) |
| `status_json`, `resource_port`, `resource_url` | read `tdk status --json` |
| `start_stack`, `wait_status_url` | `tdk up` in the background, then wait until the resource is routed |
| `running_container`, `wait_restarted` | find a resource's container, and wait for a replaced one after a restart |
| `traefik_request`, `traefik_request_ok` | curl a resource's Traefik route; the `_ok` form fails on non-2xx |
| `with_stub`, `stop_stub` | stand-in server (`stub.mjs`: hang, stall, status, json) behind `TDK_SERVICE_BASE_URL` |
| `mcp_session`, `mcp_structured` | one `tdk mcp` stdio session through `mcp-client.mjs` |
| `e2e_diagnostics`, `e2e_cleanup` | failure artifacts; remove the scratch stack, volumes, networks and folder |

The `.mjs` helpers have unit tests in `tests/e2e/lib/__tests__/`, which `make test-shell` runs with `node --test`.

## Worked example: the agent suite

1. **Scaffold the way a user does.** A1 runs `tdk project --yes` and `tdk resource bot --type agent`, then changes the scaffold's `runTurn` the way the scaffold tells a user to. It fails loudly if the scaffold has changed.
2. **Boot and wait.** A2 runs `tdk up` in the background and calls `wait_stack`: first `tdk status --json` must list the agent with a url, then `/ready` must answer 200 through Traefik.
3. **Check the contract.** A3 checks `/health` and `/ready` through Traefik, and that the agent publishes no host port. A4 writes a turn and reads it back with `tdk agent sessions --json`, asserting the envelope shape. A5 checks sticky routing.
4. **Restart and survive.** A6 runs `tdk restart` and waits for a replaced container, then checks that the checkpoint survived. A8 sends SIGTERM during a slow turn and checks the drain. A7 cycles `tdk down` and `tdk up`, then removes the volume.
5. **Break it on purpose.** B0 stops the container. B1 to B8 each assert one error code from the envelope, using `with_stub` to make the "agent" hang (B2), stall (B3) or answer 400 and 500 (B4).
6. **Same answers over MCP.** C1 to C3 speak JSON-RPC to `tdk mcp`, and assert that each tool's `structuredContent` equals the CLI's `--json` envelope.

## Run it

You need `tdk` on your PATH (`npm pack`, then `node scripts/install-global.mjs ./<tarball>`, or a published version), plus Docker, Tilt, Node 22+, `jq` and `curl`.

```bash
make test-e2e GROUP=resource-types SUITE=agent CASES="A1 A2 A3"
```

```bash
tests/e2e/resource-types/agent/run.sh A4
```

```bash
tests/e2e/resource-types/agent/run.sh cleanup
```

Without `CASES`, `make test-e2e` runs every case in order, collects diagnostics on failure and cleans up either way. Scratch state goes to `$E2E_ROOT/<suite>` (default `$TMPDIR/tdk-e2e`), and `$OUT/<name>.out` holds each command's output.

## How CI runs it

Today `e2e-resource-types.yml` runs each suite as one matrix leg that calls `run.sh all`: on pull requests that touch the suite's paths, nightly, after each release, and by hand. On a pull request it tests that pull request's own packed CLI. The group workflow reads `suite.json` for triggers and timeout (through `tests/e2e/lib/suite-matrix.mjs`), so adding a resource-type suite does not need YAML.

## Prove it can fail

A test that has never failed has not proved anything. Every pull request that adds or changes a suite includes, as captured output in the description:

1. a passing run of the new or changed cases; and
2. a failing run caused by a deliberate break. Revert or change the behavior under test locally, run the case, and paste the failure. Then undo the break.

For example: make `tdk agent sessions` drop `data.session`, run A4, and show `ASSERT FAILED: the checkpoint is nested under data.session`. Reviewers do not accept a suite without both runs.

## Checklist

- [ ] The suite is in the right group, with `run.sh` and `suite.json`.
- [ ] Each case is one function that sets up its own preconditions.
- [ ] Waits use `poll_until`; restarts use `wait_restarted`; dependent requests use `traefik_request_ok`.
- [ ] Error paths assert one envelope with `assert envelope`.
- [ ] `make test-shell` passes.
- [ ] The pull request shows a passing run and a deliberate-break run.
