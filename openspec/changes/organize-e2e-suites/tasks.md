# Tasks

## 1. Foundation

- [ ] 1.1 Extract shared helpers from `scripts/agent-e2e.sh` and `scripts/agent-e2e/*.mjs` into `tests/e2e/lib/` (`lib.sh`, `assert-json.mjs`, `mcp-client.mjs`, `stub.mjs`, `traefik` helper, `wait_restarted`), with unit tests for the `.mjs` helpers
- [ ] 1.2 Define `suite.json` (paths, cases, triggers, timeoutMinutes, needsSecrets) and a validator
- [ ] 1.3 Move the agent suite to `tests/e2e/resource-types/agent/` (`run.sh` + `suite.json`) using the shared library
- [ ] 1.4 Add `make test-e2e GROUP=<group> SUITE=<suite> [CASES=...]`
- [ ] 1.5 Prove the moved agent suite green on CI and red on one deliberate break; post both outputs on the PR

## 2. Group workflows

- [ ] 2.1 Add `e2e-resource-types.yml`: changes job from `suite.json` paths, matrix of selected suites, failure artifacts, always-running `e2e-resource-types` gate
- [ ] 2.2 Make the gate also report the currently required check names until branch protection is switched
- [ ] 2.3 Remove `agent-e2e.yml` once the group workflow runs the agent suite

## 3. Resource-type coverage

- [ ] 3.1 Add the coverage unit test (valid resource types vs `tests/e2e/resource-types/*` and `allowlist.json` with issue links)
- [ ] 3.2 Move `scripts/verify-mcp.sh` into `resource-types/mcp` and run it in CI
- [ ] 3.3 Move `scripts/verify-frontend-frameworks.sh` into `resource-types/frontend` (one matrix leg per framework group)
- [ ] 3.4 Move `tests/e2e/byo-python*.test.sh` and `scripts/verify-byo-{example,job,pair,tdk}.sh` into `resource-types/bring-your-own`
- [ ] 3.5 Add a `resource-types/backend` suite from the backend parts of quickstart (scaffold, routed health, restart, error envelope)
- [ ] 3.6 Add `resource-types/worker` (processes a job) and `resource-types/migrator` (migration completes before the API, per the migrator rule)
- [ ] 3.7 Add `resource-types/library` and `resource-types/sdk` (consumed build), or allowlist them with tracking issues

## 4. Other groups (one suite per PR)

- [ ] 4.1 journeys: quickstart, smoke, dev-loop-go, cold-start (keep its never-on-PR secret rule)
- [ ] 4.2 examples: default, real-apps, python
- [ ] 4.3 platforms: windows, wsl2
- [ ] 4.4 scale: erp, benchmarks (manual, weekly, main)
- [ ] 4.5 Each move PR lists cases before and after, and shows a passing run plus a deliberate-break run

## 5. Contributor guide and skill

- [ ] 5.1 Write `docs/contributing/05-write-e2e.md`: when an e2e is required, choosing the group, suite anatomy, shared helpers, running a case, CI triggers, deliberate break and evidence, with the agent suite as the worked example
- [ ] 5.2 Link it from `CONTRIBUTING.md` (Tests) and `docs/contributing/README.md`. Add an "E2E" line to each recipe in `docs/contributing/02-feature-recipes.md`
- [ ] 5.3 Write `.claude/skills/tdk-e2e-author/SKILL.md` and link it from `.agents/skills/`
- [ ] 5.4 Make `scripts/sync-tdk-skills.sh` keep skills listed in `.claude/skills/LOCAL`, and extend the D2 fixture test to cover it
- [ ] 5.5 Run the docs link check over the new pages

## 6. Cutover

- [ ] 6.1 Maintainers switch branch protection to the `e2e-<group>` gate names
- [ ] 6.2 Remove the compatibility check names and the old workflow files and scripts
- [ ] 6.3 Run `openspec validate organize-e2e-suites --strict`
