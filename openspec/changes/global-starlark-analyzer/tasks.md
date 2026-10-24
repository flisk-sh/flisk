## 1. Reusable workflow

- [ ] 1.1 Create `flisk-sh/.github/.github/workflows/starlark-analyze.yml` with `on: workflow_call` and inputs `paths` and `category`.
- [ ] 1.2 Copy the `changes` gate and pin every action to the same SHAs `codeql.yml` uses (`actions/checkout`, `dorny/paths-filter`, `github/codeql-action/upload-sarif`).
- [ ] 1.3 Set `permissions` to `contents: read` and `security-events: write` on the analyze job only; `timeout-minutes` on every job.
- [ ] 1.4 Run `actionlint` and `zizmor` on the new workflow (repo already has `actionlint.yaml` and `zizmor.yml` configs).

## 2. Analyzer

- [ ] 2.1 Pick the implementation language and location (see design.md); keep it dependency-light.
- [ ] 2.2 Parse `.star` and `Tiltfile` files with a Starlark grammar; report parse errors as SARIF notifications, not crashes.
- [ ] 2.3 Implement the first rule pack: unpinned remote `load()`, string-built `local_resource` commands, literal secrets, calls that read outside the project root.
- [ ] 2.4 Emit SARIF 2.1.0 with stable `ruleId`, file, region and a `partialFingerprints` value so repeat runs do not reopen alerts.
- [ ] 2.5 Add fixture files for every rule (one bad, one good) and a test that asserts the exact findings.

## 3. Flisk wiring

- [ ] 3.1 Add a `starlark` job to `.github/workflows/codeql.yml` that calls the reusable workflow; keep the `analyze` matrix and its check names unchanged.
- [ ] 3.2 Add the job to `.github/ci-inventory.json` with tier `security`.
- [ ] 3.3 Run the inventory check and `make test-shell` or the repo's equivalent; capture exit codes.

## 4. Promotion

- [ ] 4.1 Write a README for the reusable workflow with a caller snippet and the origin note (built from Flisk's CodeQL setup, owned by `flisk-sh`).
- [ ] 4.2 Update `docs/ROADMAP.md` and the static-analysis justification in `.github/bestpractices.json` after the first green run on `main`.
- [ ] 4.3 Announcements or listings outside GitHub: maintainer decision, not part of this change.

## 5. Verification

- [ ] 5.1 Open a draft PR in flisk with a deliberately bad `.star` file and capture the code scanning alert as evidence.
- [ ] 5.2 Confirm the existing `analyze (javascript-typescript)` and `analyze (actions)` checks still report under the same names.
