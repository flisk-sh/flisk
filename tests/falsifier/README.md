# FALSIFIER

Property-based testing for Flisk. ENIGMA generates projects and ORACLE checks that Flisk's surfaces agree; FALSIFIER checks that
what they agree on is *right*, against expectations written in `lib/model.mjs` without reading the CLI. No Docker, no Tilt, no CI
workflow: run it locally (and nightly later, once its run time and yield are measured).

```bash
node tests/falsifier/run.mjs                                   # 100 scenarios, seed 1
node tests/falsifier/run.mjs --seed 40 --scenarios 20 --property cycles
node tests/falsifier/run.mjs --out /tmp/falsifier --save-regressions
node tests/falsifier/run.mjs --replay tests/falsifier/regressions/<file>.json
node --test tests/falsifier/__tests__/*.test.mjs
```

| Property | Bug it catches | Spec (independent) |
| --- | --- | --- |
| `invalid-resources-rejected` | invalid config silently accepted | names/stacks are DNS labels (1-63, `[a-z0-9-]`, no edge hyphen); bad type or the same name in another stack is refused and scaffolds nothing |
| `dependency-cycles-detected` | broken dependency graph | own DFS: any cycle (incl. self-loop) is refused by `config verify` and `up --dry-run` and named; DAGs (diamonds, fan-in) are accepted |
| `removal-leaves-no-references` | stale configuration | after deleting a resource and `config regenerate`, no surface or generated file mentions it (ENIGMA-drawn project) |
| `compose-preserves-definitions` | missing resources in Compose | every bring-your-own resource, env value (YAML-hostile ones too), image and dependency survives `export compose` |
| `validation-is-deterministic` | nondeterminism | two runs of verify/status/resources/stacks/up give equal output; a second `regenerate` changes no file |

Each scenario is plain JSON drawn from `seed + i`; a failure prints the seed, commit and replay command and is shrunk
(`lib/minimize.mjs`, greedy delta debugging; the removal and determinism scenarios are not shrinkable). Findings are saved in
`regressions/` and replayed by `__tests__/regressions.test.mjs`.

Reused, not copied: ORACLE's `runFlisk`/`scaffold`/`drawScenario`, ENIGMA's `drawPlan` and `rng`. ORACLE's `dependson-graph-agrees`
only closes a chain into a cycle; FALSIFIER draws random graphs.

## Boundary with `same-stack` re-registration
`flisk resource <name>` on an existing directory in the same stack re-registers it (documented), so only another stack counts as a duplicate.
