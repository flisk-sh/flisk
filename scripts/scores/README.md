# Scoreboard

Deterministic scores for the repository, the npm package, the website and the community. Every number comes from files, a
CI artifact or GitHub API counts. No model is involved, so the same input always gives the same score, and a drop points
at a file and a line, the way a lint error does.

```bash
make scores                                   # the files scorers, as on every pull request
node scripts/scores/run.mjs --source all      # also the GitHub-data scorers (needs gh, signed in)
node scripts/scores/run.mjs --only claims-guard --markdown
```

## Modes

| Mode | Fails when | Where it runs |
| --- | --- | --- |
| gate | the value misses `meta.target` | `make test-shell` on every pull request |
| ratchet | the value is worse than its entry in `baseline.json` (beyond `meta.tolerance`, a fraction) | `make test-shell`; install-weight in ci.yml's Pack CLI job |
| report | never | the weekly `📊 CI \| Scoreboard` workflow |

`--check` turns a failing gate or ratchet, or a scorer that throws, into exit code 1. A row with no data (an artifact
scorer without its file, a survey nobody has answered yet) is skipped, not failed.

## Raising a baseline

When a pull request makes a ratchet better, record it so it cannot slip back:

```bash
node scripts/scores/run.mjs --update-baseline
```

`--update-baseline` only moves a ratchet in its better direction. When a change makes a ratchet worse on purpose (the
package grows because a feature needs it), edit its number in `baseline.json` by hand in the same pull request and say
why in the description.

## Adding a scorer

Add `scripts/scores/<id>.mjs` exporting:

```js
export const meta = {
	id: "<id>", // the file name
	title: "What it measures",
	source: "files", // files | artifact | gh
	mode: "ratchet", // gate | ratchet | report
	better: "higher", // higher | lower
	unit: "%",
	// target: 0,      gates only
	// tolerance: 0.1, ratchets with noisy values
};

export function measure(ctx) {
	// ctx: { root, repo, now, gh(args) -> parsed JSON, tarball?, lighthouse?, mutation? }
	return { value: 42, summary: "one line", findings: ["path:line what is wrong"] };
}
```

and a `<id>.test.mjs` next to it. `run.test.mjs` fails until a new ratchet has a baseline. Shared helpers live in
`lib.mjs`.

## Checks that guard the doctor and public environment variables

| Scorer | Mode | Guards |
| --- | --- | --- |
| `public-env-secrets` | gate, 0 | no secret-looking value in a tracked `NEXT_PUBLIC_*` / `VITE_*` example |
| `public-env-heuristic` | gate, 100% | `flisk doctor`'s secret heuristic agrees with a labelled corpus (false positives and negatives) |
| `doctor-check-docs` | ratchet | share of doctor checks named in `docs/troubleshooting.md` |

How each works, why it earns a place in CI and how to fix a finding: [docs/scoreboard](../../docs/scoreboard/README.md).
