## Why

CI tests the CLI from a locally packed tarball, so nothing verifies that the package users actually install from the public npm registry (`@flisk-sh/flisk`) installs and runs. A broken publish, a bad `files` list, or a version mismatch would reach users undetected. Adding a CI job that installs the pinned published package and checks it runs closes that gap.

## What Changes

- Add a `npm-package-smoke` job to `.github/workflows/ci.yml` that installs `@flisk-sh/flisk` from the public npm registry at an exact pinned version.
- The job verifies that `flisk --version` reports the pinned version, and fails otherwise.
- Include the job in the `summary` gate so a failure fails the required check.
- Document the pinned version and the bump procedure.

## Capabilities

### New Capabilities
- `ci`: Requirements for installing and verifying the published `@flisk-sh/flisk` package in CI. No baseline `ci` spec exists under `openspec/specs/`, so this change introduces it.

### Modified Capabilities
- None.

## Non-goals

- Changing how the package is built, packed, or published.
- Replacing the existing `package-smoke` job, which tests the local tarball.
- Testing the full `flisk project` / `flisk resource` flow against the registry package (the tarball job already covers that).

## Impact

- CI workflow: `.github/workflows/ci.yml` (new job, `summary` needs list).
- Documentation: a short note in `cli/README.md` or a contributor doc under `docs/`.
- No change to CLI runtime behavior or `cli/dist/`.
