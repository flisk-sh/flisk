## Context

See proposal.md for why. This is the inventory on `origin/main` (5194a45a plus later releases) and where each item goes:

| Today | What it proves | Group / suite | Runs in CI today |
|---|---|---|---|
| `quickstart-e2e.yml` | README quickstart: backend + React + Vue, routed `/health` | journeys / quickstart | PR, nightly, after release |
| `smoke-e2e.yml` + `scripts/verify-smoke.sh` | smoke runner pass/fail records | journeys / smoke | PR (path-filtered) |
| `go-dev-loop-e2e.yml` + `scripts/e2e/go-dev-loop.sh` | Go backend live reload | journeys / dev-loop-go | PR |
| `cold-start-e2e.yml` + `scripts/e2e/cold-start.sh` | licensed deferred start | journeys / cold-start (secret, never on PR) | nightly, after release |
| `example-e2e.yml` | default example boots | examples / default | PR, main |
| `examples-e2e.yml` | saas-starter + restaurant real routes | examples / real-apps | daily |
| `python-example-e2e.yml` | Python provider example | examples / python | PR (path-filtered) |
| `byo-e2e.yml` + `tests/e2e/byo-python.test.sh` | BYO dry run | resource-types / bring-your-own | PR |
| `byo-boot-e2e.yml` + `tests/e2e/byo-python-boot.test.sh` | BYO boot | resource-types / bring-your-own | daily |
| `scripts/verify-byo-{example,job,pair,tdk}.sh` | BYO variants | resource-types / bring-your-own | **never** |
| `scripts/verify-mcp.sh` | MCP resource | resource-types / mcp | **never** |
| `scripts/verify-frontend-frameworks.sh` | every frontend framework | resource-types / frontend | **never** |
| `agent-e2e.yml` + `scripts/agent-e2e.sh` (#1272) | agent resource, sessions, restart, MCP tools | resource-types / agent (reference) | PR, nightly, after release |
| `windows-smoke.yml`, `wsl2-smoke.yml` | host support | platforms / windows, wsl2 | PR, push |
| `erp-scale-e2e.yml`, `benchmarks.yml` | 100-service boot, start-up timing | scale / erp, benchmarks | manual, weekly, main |
| `cli/src/commands/__tests__/*-e2e.test.ts` | CLI against temp projects | cli-integration (stays in vitest) | every PR via `make test-ts` |

There is no live-stack coverage for `worker`, `migrator`, `library` or `sdk`. `make test-shell` runs `bash -n` on `scripts/verify-*.sh`, which only checks syntax.

## Goals / Non-Goals

**Goals:**
- One obvious home and one shape for every e2e suite, so the guide and the skill can describe a single procedure.
- Coverage gaps become failing checks or tracked allowlist entries, not silence.
- No assertion is lost in the move, and required checks keep reporting throughout.

**Non-Goals:**
- Rewriting assertions in the stackless `*-e2e.test.ts` files. They are classified as `cli-integration` and stay in vitest. A rename to `*.integration.test.ts` is optional and done only if the group check needs it.
- New product features, or making Windows run full live-stack suites.
- Changing which suites need secrets. `cold-start` keeps its never-on-PR rule.

## Decisions

### Group by what a suite proves, not by trigger or tool
Alternatives were grouping by trigger (PR / nightly / manual) or by runner (bash / vitest). Both scatter one feature's tests and change when costs change. Grouping by what is proven (a resource type, a user journey, a real app, a host, scale) maps directly to the question a contributor asks: "I changed X, where is its e2e?" Triggers become per-suite metadata instead.

### `tests/e2e/<group>/<suite>/run.sh`, modeled on the agent suite
The agent suite already has the needed properties: case ids runnable alone, `list` / `diagnostics` / `cleanup`, bounded `poll_until`, a `run` wrapper recording exit code and elapsed time, `assert envelope` for single-envelope checks, Traefik requests that resolve `*.localhost` to loopback, and stubs pointed at by `TDK_SERVICE_BASE_URL`. Bash plus small Node helpers was chosen over vitest for live stacks because each case maps to one CI step with its own log, contributors can run a case by hand, and nothing has to be built before a run. Vitest stays for stackless tests.

### Shared helpers extracted, not copied
`scripts/agent-e2e/{assert-json,mcp-client,stub,check-docs}.mjs` and the shell helpers in `scripts/agent-e2e.sh` move to `tests/e2e/lib/` (`lib.sh` sourced by every `run.sh`, plus the `.mjs` files). The agent suite is migrated first and must stay green. Lessons it already encodes become library behavior: wait for a *replaced* container after a restart (the old one answers `/ready` until Tilt swaps it), and use `node:http` for requests that set `Host` (`fetch` drops it).

### One workflow per group with a matrix and a gate job
Alternatives were one workflow per suite (today's sprawl) or one workflow for everything (one slow red X for any failure). Per group, a `changes` job computes which suites the PR touches from each suite's declared paths. The matrix runs only those, and a final `e2e-<group>` gate job always runs and fails if any selected suite failed. Branch protection requires the gate, so path filtering never leaves a pending required check. Nightly and `workflow_run` after release select every suite in the group. `scale` and `journeys/cold-start` keep manual or weekly triggers.

### Suite metadata in a `suite.json` next to `run.sh`
Each suite declares its `paths`, `cases` (CI order), `triggers` (pr, nightly, release, manual, weekly), `timeoutMinutes` and `needsSecrets`. Workflows read it, so a contributor adding a suite edits one folder, not YAML. The coverage check also reads it.

### Coverage check is a CLI unit test
A vitest test imports the list of valid resource types and compares it with the directories under `tests/e2e/resource-types/` and `tests/e2e/resource-types/allowlist.json` (`{ "type": { "reason": "...", "issue": "https://github.com/..." } }`). It runs in the existing Test job on every PR, so it needs no new workflow. Initial allowlist: `library` and `sdk` if a consumed-build case is not ready in the first pass. `worker` and `migrator` get suites.

### Repo-local skills survive the sync
`scripts/sync-tdk-skills.sh` currently deletes every directory in `.claude/skills` and every link in `.agents/skills`, then restores only the upstream ones. It will keep any skill listed in `.claude/skills/LOCAL` (one name per line) and re-create its `.agents/skills` link. `tdk-e2e-author` is the first entry. The D2 case of the agent suite extends to cover this. The alternative, putting the skill in the upstream `tdk-skills` repository, would make a contributor-only skill ship to every TDK user.

### Migration order
1. Land #1272. Extract `tests/e2e/lib/` and move the agent suite, then prove it green on CI.
2. Add the group workflows with gate jobs that also report the old required check names. Move `resource-types` suites (bring `verify-mcp.sh`, `verify-frontend-frameworks.sh` and the BYO scripts in), then add `worker` and `migrator`.
3. Move `journeys`, `examples`, `platforms` and `scale`, one suite per pull request, each with a passing run and a deliberate-break run.
4. Maintainers switch branch protection to the gate names. Then the compatibility check names and the old workflow files are removed.
5. Docs and skill land with step 1 (they describe the agent suite), and get updated as each group moves.

## Risks / Trade-offs

- [CI time grows when the six unrun scripts start running] → They run only on matching paths and nightly. Frontend frameworks and BYO variants run as separate matrix legs.
- [Renamed checks can block merges] → Gate jobs report the old names until branch protection is switched (step 4). The switch is one maintainer action, listed as a task.
- [Moving tests silently drops assertions] → Each move PR includes a before/after list of cases and one deliberate break per suite.
- [Large refactor touches many files at once] → Done as a series of small PRs against `main`, each one suite, with no stacked PRs.
- [Bash suites are harder to unit test] → Helpers stay small. The `.mjs` helpers carry the logic and get unit tests in `tests/e2e/lib/__tests__/`.
- [A `suite.json` read by workflows is new indirection] → It is validated by the coverage test, so a typo fails on the PR rather than producing a silently skipped suite.
