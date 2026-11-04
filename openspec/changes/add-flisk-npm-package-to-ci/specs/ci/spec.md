# CI Specification

## ADDED Requirements

### Requirement: CI verifies the published npm package

The CI pipeline SHALL install `@flisk-sh/flisk` from the public npm registry at an exact pinned version and verify that the installed CLI reports that version.

#### Scenario: Pinned package installs and reports its version

- **WHEN** the `npm-package-smoke` job runs on a non-docs-only change
- **THEN** it installs `@flisk-sh/flisk` at the pinned version from the public npm registry
- **AND** `flisk --version` output contains the pinned version
- **AND** the job succeeds

#### Scenario: Installed version does not match the pin

- **WHEN** `flisk --version` does not contain the pinned version
- **THEN** the job exits with a non-zero status
- **AND** the error names both the reported version and the pinned version

### Requirement: The pinned version is exact and deterministic

The CI pipeline SHALL use an exact version for the registry install and SHALL NOT use a version range or `latest`.

#### Scenario: Version is explicit

- **WHEN** the job resolves the package to install
- **THEN** the version is the exact pin in `.github/npm-package-smoke/package.json`, installed through its lockfile

### Requirement: Published-package failures gate the workflow

The `summary` job SHALL include `npm-package-smoke` in its gate, so a failed or cancelled run of that job fails the required check.

#### Scenario: Smoke job fails

- **WHEN** `npm-package-smoke` ends with a result other than success or skipped
- **THEN** the `summary` job fails

### Requirement: Existing CI checks remain intact

Adding `npm-package-smoke` SHALL NOT remove or weaken existing CI jobs, including `package-smoke`.

#### Scenario: Existing jobs still run

- **WHEN** the CI workflow runs after this change
- **THEN** `package-smoke` and the existing lint, typecheck, test, and package jobs continue to run

### Requirement: Package contents are checked before and after publish

CI SHALL run `scripts/check-npm-package.mjs` on the root package pack in the `package` job and on the pinned registry tarball in `npm-registry-audit`, a job outside the summary gate because no pull request can change a published tarball. The check SHALL fail when the package ships test files, ships a path outside the allowlist, or does not declare `"type": "module"`.

#### Scenario: A test file would ship

- **WHEN** the pack contains a path under `__tests__/` or `tests/`, a `*.test.*` or `*.spec.*` file, or a `test_*.py` file
- **THEN** the check exits non-zero and lists each such path

#### Scenario: An unexpected path would ship

- **WHEN** the pack contains a path outside `cli/bin`, `cli/dist-bundle`, the `main` entry files `cli/dist/types/index.js` and `cli/dist/utils/constants.js`, `cli/templates`, `cli/shared-platform-engineering/docker-templates`, `runtime/`, `examples/flisk-example/`, or the top-level `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`
- **THEN** the check exits non-zero and lists each such path

#### Scenario: The CLI would ship twice

- **WHEN** the pack contains any other file under `cli/dist/` (such as `cli/dist/cli.js`) next to `cli/dist-bundle/`, which is the only copy `cli/bin/flisk.js` runs in an installed package
- **THEN** the check exits non-zero and lists each such path as outside the allowlist

#### Scenario: Auditing a version that is already published

- **WHEN** `npm-registry-audit` checks the pinned registry tarball with `--published`, and that version ships `cli/dist/` or a root `CHANGELOG.md` (the layout before 1.4.8)
- **THEN** the check accepts those paths and still fails on test files, missing required paths and every manifest problem

#### Scenario: The main entry imports a file that does not ship

- **WHEN** the `main` entry, or a file it imports, imports a relative path that is not in the tarball
- **THEN** the check exits non-zero and names each missing file

#### Scenario: The module format is not declared

- **WHEN** the packaged `package.json` has no `"type": "module"`
- **THEN** the check exits non-zero, because registry sites otherwise report the ESM CLI as CommonJS

### Requirement: The pinned version has provenance

`npm-package-smoke` SHALL fail when the pinned registry version has no SLSA provenance attestation.

#### Scenario: Provenance is missing

- **WHEN** `npm view @flisk-sh/flisk@<pin> dist.attestations.provenance.predicateType` is not `https://slsa.dev/provenance/v1`
- **THEN** the job exits non-zero and names the version

### Requirement: The package keeps what the installed CLI needs

`scripts/check-npm-package.mjs` SHALL run on the real packed tarball (after `prepack`) and SHALL fail when a required path is missing, when a `bin` target is not in the tarball, or when `engines.node` is not declared. The `package-smoke` job SHALL install that tarball and run `flisk project example`.

#### Scenario: A required path is missing

- **WHEN** the tarball lacks any of `cli/bin/flisk.js`, `cli/dist-bundle/cli.js`, `cli/package.json`, `runtime/Tiltfile`, `runtime/specs/specs/TILT_TECH_STACK.star`, `examples/flisk-example/Tiltfile`, `package.json`, `README.md`, or `LICENSE`
- **THEN** the check exits non-zero and names each missing path

#### Scenario: The bundled example stops working

- **WHEN** `flisk project example --yes` from the installed tarball does not write `flisk-example/Tiltfile` and `flisk-example/TILT_TECH_STACK.star`
- **THEN** the `package-smoke` job fails
