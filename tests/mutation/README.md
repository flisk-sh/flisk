# Mutation yield check

Measures what the bug-finding engines catch. `mutants.mjs` lists known bugs; `run.mjs` injects them one at a time into the CLI
(source and dist) and records whether the CLI's unit tests, FALSIFIER and ORACLE notice. Run it in a worktree you are not editing:
it rewrites `cli/src` and `cli/dist` in place and restores them afterwards.

```bash
node tests/mutation/run.mjs                                  # every CLI mutant; about 5 minutes each (ORACLE dominates)
node tests/mutation/run.mjs --mutant edge-hyphen-allowed --oracle-seeds 1
node tests/mutation/run.mjs --skip oracle,unit                # FALSIFIER only
node tests/mutation/run.mjs --export-repo ../flisk-export     # also the Compose exporter mutants
```

The Compose exporter is its own repo (`flisk-sh/flisk-export`). Its mutants edit a local clone (`npm install` there first), rebuild it
and point flisk at it with `FLISK_EXPORT_PACKAGE`; the exporter's CI is `typecheck`, `lint`, `build`, `test`, so nothing needs to run
in that repo. `__tests__/mutants.test.mjs` fails when a mutant stops matching the code it mirrors (set `FLISK_EXPORT_REPO` to check
the exporter ones).

## First results (FALSIFIER 25 scenarios, ORACLE 2 seeds)

| Injected bug | Unit tests | FALSIFIER | ORACLE |
| --- | --- | --- | --- |
| name limit 253, not 63 | caught | caught | missed |
| stack name length never checked | caught | caught | missed |
| uppercase allowed in names | caught | caught | missed |
| name may start or end with a hyphen | caught | **missed** | missed |
| first dependency cycle not reported | caught | caught | missed |
| self-dependency is not a cycle | caught | caught | missed |

ORACLE compares surfaces with each other, so a bug that changes all of them alike is outside what it can see. FALSIFIER never draws
a name that starts or ends with a hyphen; adding those to its invalid-name generator closes the gap.
