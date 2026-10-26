# Tasks

## 1. Pin the published version

- [x] 1.1 Confirm the version to pin with `npm view @flisk-sh/flisk version` and confirm it matches the release being verified. (1.4.0 is live on npm.)
- [x] 1.2 Pin that exact version in `.github/npm-package-smoke/package.json` and its lockfile.

## 2. CI integration

- [x] 2.1 Add the `npm-package-smoke` job to `.github/workflows/ci.yml`, gated on `docs_only`.
- [x] 2.2 Install `@flisk-sh/flisk@<pin>` globally with npm on Node 22.12+ with Bun on PATH.
- [x] 2.3 Verify `flisk --version` contains the pinned version and fail otherwise.
- [x] 2.4 Add `npm-package-smoke` to the `summary` job `needs` list.
- [x] 2.5 Register the job in `.github/ci-inventory.json` (`scripts/check-ci-inventory.mjs` passes).
- [x] 2.6 Check package contents (tests, allowlist, `"type": "module"`) in the `package` job and on the registry tarball; check registry provenance.
- [x] 2.7 Publish a release built from this branch and move the pin to it, so `npm-package-smoke` passes. (1.4.1)

## 3. Documentation

- [x] 3.1 Document why the registry package is verified in CI (`CONTRIBUTING.md`).
- [x] 3.2 Document the bump procedure for the pinned version (`CONTRIBUTING.md`).

## 4. Validation

- [x] 4.1 Validate the workflow YAML with actionlint and the OpenSpec change with `--strict`.
- [ ] 4.2 Run the workflow on a test branch and confirm the job passes.
- [ ] 4.3 Confirm a mismatched pin fails the job with a clear error.
- [ ] 4.4 Confirm existing CI checks still pass.
