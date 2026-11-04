# Add a check to CI

A check is two files in `scripts/scores/`: `<id>.mjs` and `<id>.test.mjs`. No workflow edit is needed; `run.mjs` finds
every scorer, and `make test-shell` runs them all with `--check`.

## 1. Write the scorer

```js
export const meta = {
	id: "my-check", // the file name
	title: "What it measures",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "findings",
};

export function measure({ root }) {
	return { value: 0, summary: "one line", findings: ["path:line what is wrong"] };
}
```

Rules that keep it deterministic:

- Read only `root`. No clock, no network, no randomness (a clock-based scorer is a `report`).
- Sort what you iterate, so findings come out in the same order everywhere.
- Never put a secret value in a finding. Name the file, the line and the rule.
- Reuse `lib.mjs` (`walk`, `read`, `has`) and `tracked-secrets.mjs` (`trackedFiles`) rather than re-walking the tree.
- Prefer importing the code users run (from `cli/dist`) over copying its rules, so the check and the product cannot
  disagree. Say in the error how to build it.

## 2. Test it on a fixture

Build a temporary directory, write the files you want judged, call `measure({ root })` and assert on `value` and
`findings`. Cover: a clean tree, one violation, a skipped (generated) path, and a missing input. A test that spawns
nothing and reads no real repository stays fast and cannot flake.

```bash
bun test ./scripts/scores/my-check.test.mjs      # or: node --test scripts/scores/my-check.test.mjs
```

## 3. Make sure it is red for the right reason

Temporarily break the thing it guards and read the finding. A check that cannot fail is not a check.

## 4. Ratchets need a baseline

`run.test.mjs` fails until a ratchet has an entry in `baseline.json`. Run `node scripts/scores/run.mjs --update-baseline`.

## 5. Document it

Add a page here that says what it checks, how, why it is good in CI, how to fix a finding and what it cannot see.
Link it from [this index](README.md).
