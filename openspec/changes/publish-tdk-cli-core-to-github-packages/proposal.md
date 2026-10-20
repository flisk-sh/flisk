# Proposal

## Why

`@tdk-landscape/tdk-cli-core` is published on public npm, but consumers who prefer or require GitHub Packages have no GitHub registry distribution to install. Publishing the same release artifact to GitHub Packages provides an additional first-party channel while keeping npm as the default distribution.

## What Changes

- Add authenticated publication of the scoped CLI package to GitHub Packages alongside the existing npm release.
- Document registry mapping, authentication, and installation for GitHub Packages consumers.
- Keep public npm publication and its existing consumer workflow unchanged.

## Capabilities

### New Capabilities

- `github-packages-publish`: Publishing the CLI package to GitHub Packages and installing it from that registry.

### Modified Capabilities

None.

## Impact

Changes may affect package publication configuration, release workflows under `.github/workflows`, and package installation documentation. GitHub Actions requires package write permission; consumers require GitHub Packages authentication. Public npm remains the primary registry.
