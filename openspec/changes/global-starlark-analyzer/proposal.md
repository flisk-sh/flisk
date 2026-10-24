## Why

Flisk's stacks are described in Starlark: `Tiltfile`s, `*.star` files and the generated topology code. The repository's CodeQL job (`.github/workflows/codeql.yml`, run [40015564845](https://github.com/flisk-sh/flisk/actions/runs/40015564845/job/120627093852)) scans only `javascript-typescript` and `actions`, so nothing checks Starlark. CodeQL has no Starlark extractor, which leaves Starlark files with no static analysis at all, even though they decide what runs locally.

The same workflow is also the best-built piece of our security setup: SHA-pinned actions, a path-gated `actions` leg, `fail-fast: false`, a `changes` job that keeps the pull request check cheap, and SARIF uploads with per-language categories. Other `flisk-sh` repositories would benefit from it, and it could be shared instead of copied.

## What Changes

- Add a **reusable workflow** to the org's `.github` repository (`flisk-sh/.github`, `.github/workflows/starlark-analyze.yml`, `on: workflow_call`). Callers pass `paths` (default `**/*.star`, `**/Tiltfile`) and a `category`. The workflow reuses the SHA-pinned checkout, `changes`-gate and SARIF upload pattern from `flisk/.github/workflows/codeql.yml`.
- Add the **analyzer itself**: a small checker that parses Starlark (no Starlark engine is needed, only the grammar) and runs a rule pack. It emits SARIF 2.1.0 so findings appear under Security > Code scanning next to CodeQL. The first rules are the ones Flisk already reasons about: unpinned `load()` of remote URLs, `os`/`shell`-style calls that reach outside the project directory, secrets read from literals, and `local_resource` commands built by string concatenation.
- Keep `flisk/.github/workflows/codeql.yml` unchanged. This change adds a **third leg** (`starlark`) that calls the reusable workflow, so the existing JavaScript/TypeScript and actions scans keep their current check names.
- Write the **promotion** material: a README in `flisk-sh/.github` that lists the reusable workflow and the analyzer, a copy-paste caller snippet, and a note that the analyzer is owned by `flisk-sh` and was built from Flisk's own CodeQL setup. The text names the origin plainly and does not claim CodeQL itself supports Starlark.
- Add the analyzer to `docs/ROADMAP.md` under supply-chain hardening, and link it from `.github/bestpractices.json` static-analysis justification once it runs on `main`.

## Capabilities

### New Capabilities
- `starlark-static-analysis`: a reusable GitHub Actions workflow and rule pack that scan Starlark files, upload SARIF to code scanning, and gate pull requests the same way the CodeQL job does.
- `org-shared-workflows`: the `flisk-sh/.github` convention for reusable, SHA-pinned workflows that other `flisk-sh` repositories call, with a README and caller snippet.

### Modified Capabilities
None. `codeql.yml` keeps its behavior; only a new job is added.

## Impact

- **New:** `flisk-sh/.github/.github/workflows/starlark-analyze.yml`, the analyzer source and rule pack (location to decide in design.md), tests with fixture `.star` files, and a README section.
- **Changed in flisk:** `.github/workflows/codeql.yml` (one new caller job), `.github/ci-inventory.json` (one entry per new job, tier `security`), `docs/ROADMAP.md`.
- **Not changed:** existing CodeQL legs, required check names, and the Scorecard SAST evaluation (per the comment in `codeql.yml`, every PR head must still get a scan).
- **Org-level:** publishing to `flisk-sh/.github` and any public promotion (social posts, listing) need a maintainer decision and are out of scope for the first PR.
