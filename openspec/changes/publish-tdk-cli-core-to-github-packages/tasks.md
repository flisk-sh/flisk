# Tasks

## 1. Package and release configuration

- [x] 1.1 Confirm `package.json` retains the scoped name `flisk` and canonical repository URL; verified with the bundled Node runtime (the environment has no npm executable).
- [x] 1.2 Add an explicit GitHub Packages publish invocation that uses the single packed release artifact and targets `https://npm.pkg.github.com`; verified separate registry configuration for each publish step.
- [x] 1.3 Update the release workflow so the existing release trigger publishes to GitHub Packages with `GITHUB_TOKEN` and least-privilege `packages: write`; verified no PAT is needed for repository-owned publishing.
- [x] 1.4 Ensure a GitHub Packages publish failure is visible as a failed workflow and document how to retry that registry for the same version; the isolated publish job fails the workflow by default, and retry downloads the retained tarball and skips versions already present.

## 2. Consumer documentation

- [x] 2.1 Document the scoped `.npmrc` registry mapping and token configuration without including a real credential; verified examples use an environment variable and secret references.
- [x] 2.2 Document a GitHub Packages install command and retain public npm as the recommended/default channel; verified existing npm install instructions remain unchanged.
- [x] 2.3 Document the first-publish package visibility check and how to make the package public if required; documented the package settings check in `docs/github-packages.md`.

## 3. Publication and installation verification

- [ ] 3.1 Run the backfill workflow for an existing npm release (or use the regular release workflow for a new version); verify `npm view @flisk-sh/flisk@<version> --registry=https://npm.pkg.github.com` resolves the version.
- [ ] 3.2 Confirm the package is linked to `flisk-sh/flisk` and has the intended public visibility; verify the package appears on the repository Packages page.
- [ ] 3.3 From a clean environment with documented registry mapping and read authentication, install the GitHub Packages version and verify `flisk --version` reports that version; the backfill workflow includes this authenticated verification.
- [x] 3.4 Verify public npm publication and installation still work for version `1.3.186`; npm registry metadata resolved successfully, and a clean temporary global install reported `flisk --version` as `1.3.186`.
