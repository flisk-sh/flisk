# ORACLE

Differential testing for Flisk. For one generated project, ORACLE asks several parts of Flisk what they think about it and fails
when they contradict each other. It needs no Docker and no Tilt: it scaffolds with the real CLI and reads files and `--json`
output.

```bash
node tests/oracle/run.mjs                              # one random seed, a random shape
node tests/oracle/run.mjs --seed 1936 --shape byo-only # replay
node tests/oracle/run.mjs --seed 100 --seeds 20 --out /tmp/oracle   # a sweep; writes oracle-failures.json
node --test tests/oracle/__tests__/*.test.mjs          # unit tests (run by `make test-shell`)
```

## Boundary

`flisk doctor` owns environment and service checks; `flisk config verify` owns generated-project consistency. ORACLE does not
move that line. It reads only the doctor checks that describe the project (`Shared platform Postgres`, `Environment
Variables`, `Master Configs`) and never the Docker, Tilt or host ones, so its verdict does not depend on the machine.

## Surfaces

| Surface | Read as |
| --- | --- |
| status | `flisk status --json`: `platformServices`, `capabilities`, `resources` |
| verify | `flisk config verify --json`: `valid`, `sharedPlatformPostgres` |
| doctor | `flisk doctor --json --no-ping`: the three project checks above |
| env | the generated `.env` |
| compose | `flisk export compose --dry-run` (bring-your-own resources only) |
| stacks | `flisk stacks --json`, `flisk resources --json` |
| render | `flisk export render --dry-run` |
| up | `flisk up --dry-run --json` (`ok`, `unknownDependsOn`; starts nothing) |
| project | `.flisk/project.json` `optional_infra` and the generated `spec.master` |
| scenario | what the seed says the project is (the expected side) |

## Invariants (`lib/invariants.mjs`)

1. `surfaces-ran`: status, doctor, config verify and resources each print one JSON envelope. A command with no envelope is a failure, never a pass.
2. `database-need-matches-scenario`: status enables PostgreSQL exactly when the scenario needs it.
3. `gateway-need-matches-scenario`: same for the router.
4. `status-capabilities-match-platform-services`: `capabilities` lists exactly the enabled platform services.
5. `verify-postgres-matches-status`: `config verify`'s `willStart` equals status's database `isEnabled`.
6. `doctor-postgres-check-matches-status`: doctor runs its shared-Postgres check iff status enables the database.
7. `env-has-database-keys-when-database-on`: `DB_PASSWORD` is in `.env` and `DATABASE_URL` is built from it.
8. `env-has-jwt-secret`: `JWT_SECRET` is always there (local-jwt is the default auth mode).
9. `doctor-env-agrees-with-dotenv`: doctor never reports a key missing that `.env` sets.
10. `generated-files-consistent`: after `config regenerate`, verify is valid and doctor finds the files.
11. `status-lists-scaffolded-resources`: status lists exactly the resources the scenario scaffolded, with their types.
12. `stacks-command-matches-status`: `flisk stacks` and `flisk status` list the same stacks with the same counts.
13. `status-stacks-match-scenario`: every resource is on the stack it was scaffolded into.
14. `infra-flags-agree`: after `config enable-infra`/`disable-infra` and `regenerate`, `project.json` and `spec.master` carry the flags that were set.
15. `verify-notices-unapplied-infra`: before `regenerate`, `config verify` reports the changed infra flags as out of sync.
16. `dependson-graph-agrees`: a `dependsOn` cycle is refused by verify, doctor and `up --dry-run` alike; a dangling name is named by both verify and `up --dry-run`.
17. `resources-command-matches-status`: `flisk resources` and `flisk status` list the same resources.
18. `up-dry-run-lists-every-resource`: `flisk up --dry-run` would start every resource. A missing services list fails; only a `dependsOn` cycle (which up refuses on purpose) is skipped.
19. `up-stack-focus-matches-stacks`: `flisk up --dry-run <stack>` starts exactly that stack's resources (multi-stack shape).
20. `render-exports-http-resources`: `flisk export render` lists every HTTP-serving resource (backend, mcp, agent, frontend, bring-your-own) and no other.
21. `compose-matches-database-need`: exported Compose lists every bring-your-own resource and does not reference PostgreSQL or
    `DB_PASSWORD` while the database is off.

## Seeds and replay

`lib/scenario.mjs` draws a shape from the seed (salted, so it does not share ENIGMA's PRNG stream): `byo-only`,
`byo-no-proxy`, `byo-postgres-dep`, `multi-stack`, `infra-toggle`, `depends-chain`, `depends-cycle`, `depends-dangling`, or `enigma-mix`. `enigma-mix` is ENIGMA's own `drawPlan(seed, {count})`
(`tests/e2e/scale/enigma36/plan.mjs`), so a seed names the same resources in both engines and `E2E_SEED` from an Enigma 36 run
can be passed to `--seed` (with `--count`). Every failure prints its replay command.

## Failure artifact

Failures use the shared bug-memory shape so a later PHANTOM step can turn them into regression tests:

```json
{ "engine": "ORACLE", "seed": 1, "project": "oracle-1-abc", "scenario": "byo-only", "invariant": "verify-postgres-matches-status",
  "expected": "...", "actual": "...", "surfaces": ["verify", "status"],
  "reproduction": "node tests/oracle/run.mjs --seed 1 --shape byo-only", "regression_test": "pending" }
```

## Not covered yet

- Generated per-service Compose (`.autogenerated/`), which only `flisk up` writes; needs Docker and a live leg.
- `flisk up` itself (what it starts versus what status and config say): a live leg.
- `databaseMode` (external, absent) and `authMode` (jwt, none): the CLI has no such switch to scaffold yet; tracked with the
  axes in #3239.
- `.env` keys that are present but no longer needed (a BYO-only project keeps `DB_PASSWORD`): treated as harmless.
- Doctor's `Postgres credentials` check against a running volume.

## Observations that are not failures

- Known gap [#3243](https://github.com/flisk-sh/flisk/issues/3243), found by ORACLE: `flisk export render` refuses a python, go or rust
  backend that `flisk resource` just scaffolded (no Dockerfile until `flisk up`). `render-exports-http-resources` tolerates that
  one message, only for the resource the error names and only when that resource is a python, go or rust backend; delete the exemption when the issue is fixed.
- A dangling `dependsOn` name: `flisk up` warns and ignores it (`up --dry-run` exits 0), while `config verify` reports it as an
  error (`valid: false`). The two agree on the name, so ORACLE passes it; whether the severities should match is a product
  decision.
- `flisk config enable-infra verdaccio` leaves `verdaccio: false` (a paid feature), so the infra shape does not toggle it.

## CI

`.github/workflows/oracle.yml` runs 30 consecutive seeds nightly and on demand (`seed`, `seeds` inputs), prints the first seed in
the job summary, and uploads `oracle-failures.json` on failure. The unit tests run in `make test-shell`.
