# Proposal: grow TDK CLI public dependents

## Why

GitHub's “Used by” sidebar is a visible adoption signal that helps developers discover and trust a project. As of 20 October 2026, the public `flisk-sh/tdk-cli-core` repository has no reported dependents. Official examples and starter repositories demonstrate TDK but generally do not declare the published `@tdk-landscape/tdk-cli-core` package in a supported manifest, so they are not represented in GitHub's dependency graph.

The project should make legitimate package usage in its official landscape visible and give external adopters clear guidance. The goal is accurate dependency metadata and discoverability, not manufacturing dependents.

## What Changes

- Inventory public TDK example, starter, fixture, and template repositories and record their ecosystem, manifest, lockfile, and current CLI dependency state.
- In repositories where the CLI is genuinely used, declare `@tdk-landscape/tdk-cli-core` in the appropriate dependency section and commit the ecosystem's lockfile where applicable.
- For repositories without a Node manifest, assess whether adding one is technically appropriate; document exceptions instead of adding a manifest solely to influence a metric.
- Verify that the published package metadata links to the canonical public source repository.
- Document how real public adopters can declare the package so GitHub can include their repositories in the dependency graph.
- Track dependency-graph refresh and reported dependents after changes merge.

## Capabilities

None. This is a planning-only change; it does not introduce or modify a product capability.

## Impact

- Planning spans multiple public repositories in the `flisk-sh` organization and the CLI repository's adopter documentation.
- Changes are expected to be small manifest, lockfile, and documentation updates, coordinated as separate PRs where repositories are separate.
- No CLI runtime behavior, generated files, or `tdk up` contract changes are proposed.
- The reported GitHub dependents count is an outcome to measure, not a guaranteed result or a reason to add artificial dependencies.
