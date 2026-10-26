# Design: Verify the published @flisk-sh/flisk package in CI

## Context

`@flisk-sh/flisk` is the public npm package and the recommended install path (`npm install -g @flisk-sh/flisk` or `npx @flisk-sh/flisk`). The existing `package-smoke` job installs a locally packed tarball from the `package` job, so it never exercises the registry artifact. The cold-start check also needs Bun on PATH and Node 22.12+.

## Goals

- Verify the registry artifact installs and reports the expected version on every relevant PR.
- Keep the job small and fast, and make failures attributable to the published package.

## Non-Goals

- Re-testing scaffolding behavior; `package-smoke` covers it.
- Publishing or changing the release pipeline.

## Approach

1. Add `npm-package-smoke` to `.github/workflows/ci.yml`, gated on `docs_only` like `package-smoke`.
2. Pin an exact version in `.github/npm-package-smoke/package.json` and commit its lockfile; the job installs with `npm ci`, never a range or `latest`.
3. Set up Bun (existing composite action) and Node 22.12+, then run `npm install --global @flisk-sh/flisk@<pin>`.
4. Compare `flisk --version` output with the pin and fail on mismatch.
5. Add the job to the `summary` job's `needs` so it gates the required check.

## Decisions

- **Exact pin, bumped deliberately:** avoids drift when a new version is published.
- **Version check, not just install:** an install that resolves a different version would otherwise pass silently.
- **Node 22.12:** matches the package's declared engine minimum.

## Risks

| Risk | Mitigation |
|---|---|
| Registry outage fails unrelated PRs | Job is isolated; retry or re-run the job |
| Pin falls behind the repo version | Document the bump step; review on each release |
| Install succeeds but cold start fails | `flisk --version` runs the entry point; deeper checks stay in `package-smoke` |
