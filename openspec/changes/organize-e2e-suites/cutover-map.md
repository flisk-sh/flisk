# Cutover map (#1302, preparation)

Snapshot of `origin/main` at 8e979ace. Branch protection on `main` is classic protection with `strict: true` and the contexts `example-e2e` and `windows-smoke` (matches `.github/required-checks.json`). Nothing here switches a required check or removes a workflow; that waits for the group gates and the maintainer step.

## 1. Required checks: before and after

| Required today | Source on main | Replacement gate | Status of the replacement |
|---|---|---|---|
| `example-e2e` | `example-e2e.yml`, job `example-e2e`, runs `tests/e2e/examples/default/run.sh D1-D4` | `e2e-examples` (default leg of the examples axis) | Not built. Suite exists on main; tasks 4.2 open |
| `windows-smoke` | `windows-smoke.yml`, runs `tests/e2e/platforms/windows/run.sh W1-W3` | `e2e-platforms` / `windows` (task 4b.8, 4.3) | Not built. Suite exists on main; tasks 4.3 open |
| (none yet) | `ci.yml` job `summary` | aggregate gate, to include the e2e gates | Summary covers only the unit and lint tier; it cannot `needs:` jobs in other workflows, so the e2e gates must be folded in first |

Target after cutover: branch protection requires `ci.yml` `summary` and each `e2e-<group>` gate. Until then, `example-e2e` and `windows-smoke` stay required.

## 2. Old workflows: coverage on main

| Old workflow | Required? | Suite on main | Covered by a group gate on main? |
|---|---|---|---|
| `example-e2e.yml` | yes | `tests/e2e/examples/default` | no (`e2e-examples` not built) |
| `windows-smoke.yml` | yes | `tests/e2e/platforms/windows` | no (`e2e-platforms` not built) |
| `examples-e2e.yml` | no | `tests/e2e/examples/real-apps` | no |
| `python-example-e2e.yml` | no | `tests/e2e/examples/python` | no |
| `quickstart-e2e.yml` | no | `tests/e2e/journeys/quickstart` | no (`e2e-journeys` not built) |
| `smoke-e2e.yml` | no | `tests/e2e/journeys/smoke` | no |
| `go-dev-loop-e2e.yml` | no | `tests/e2e/journeys/dev-loop` | no |
| `erp-scale-e2e.yml` | no | `tests/e2e/scale/erp` | no (`e2e-scale` not built) |
| `wsl2-smoke.yml` | no | `tests/e2e/platforms/wsl2` | no |
| `cold-start-e2e.yml` | no | `tests/e2e/journeys/cold-start` (moved, #1298) | no |
| `e2e-resource-types.yml` | no (new) | `tests/e2e/resource-types/*` | yes (this is the group workflow that exists) |

Result: every old e2e workflow except `cold-start-e2e.yml` has its cases in a suite on main. None of them is run by a group gate yet, so removing any of them today would drop its PR coverage. `cold-start-e2e.yml` also has no suite.

## 3. What is left before the switch and the removal

1. Build the gates `e2e-journeys`, `e2e-examples`, `e2e-platforms`, `e2e-scale`, and the BYO and matrix gates (tasks 4.1 to 4.4, 3.4, 3.2, 3.3), each running its suite on pull requests.
2. Give the `ci.yml` `summary` job the e2e gates as dependencies (or a second aggregate), and make it the required check.
3. Add a cold-start suite, or allowlist cold-start with an issue (task 4.1 keeps its never-on-PR secret rule).
4. Ship #1295 (library and sdk), which is still a draft because its BYO legs fail.
5. Maintainers switch branch protection to the gate names and refresh `.github/required-checks.json` (`node scripts/check-ci-inventory.mjs --refresh-snapshot`).
6. Only then remove the `*-e2e.yml` files outside `e2e-*.yml`, `windows-smoke.yml` and `wsl2-smoke.yml`, and the scripts they call.
7. Run `openspec validate organize-e2e-suites --strict`, check the doc links, and archive the change.
