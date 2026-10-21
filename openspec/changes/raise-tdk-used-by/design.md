# Design: make legitimate TDK package usage discoverable

## Context

GitHub's dependency graph can surface public repositories that declare an ecosystem package dependency through supported manifests and lockfiles. This change concerns the published npm package `@flisk-sh/flisk` and a portfolio of separately maintained examples and starters. Merely installing a global CLI does not communicate a package dependency from a repository.

The package metadata in the current CLI repository already points to `git+https://github.com/flisk-sh/flisk.git`; this should be verified against the published package and retained as a release requirement. GitHub's exact display behavior and refresh timing are external to the repository and should be observed after merges.

## Goals / Non-goals

### Goals

- Identify official public repositories that genuinely use or demonstrate the published CLI.
- Record a reproducible audit of each repository's ecosystem, manifest, lockfile, and actual CLI use.
- Add appropriate declarations and lockfiles where they accurately describe project use.
- Explain the mechanism to community adopters without promising an immediate sidebar or a particular count.
- Measure the dependency graph after merge and distinguish graph entries from any sidebar display threshold.

### Non-goals

- Creating repositories or dependencies solely to inflate a metric.
- Requiring users to add an npm dependency just to install or run the standalone CLI.
- Adding a Node manifest to a non-Node project unless it has a real, maintainable role.
- Changing CLI runtime, generated project output, or installation methods.
- Guaranteeing the GitHub “Used by” sidebar appears after a specific number of repositories.

## Decisions

1. **Audit before editing.** Build a checklist of official public examples, starters, templates, and fixtures. Record repository URL, visibility, ecosystem, manifest and lockfile presence, how TDK is used, whether the package is already declared, and disposition. Exclude archived, private, unrelated, or inactive repositories with a recorded reason.

2. **Represent real usage only.** Add the CLI package to the dependency section that matches its role. Use `devDependencies` only when the CLI is a development or scaffolding tool; use a runtime dependency only if the project actually needs the package at runtime. Pin according to each repository's existing policy and update its canonical lockfile. Do not add a declaration to a repository that neither installs nor uses the package.

3. **Handle other ecosystems explicitly.** For a repository without a Node manifest, determine whether the CLI is actually consumed as an npm package. If so, document a minimal supported integration and maintain its lockfile; otherwise record an exception and provide the appropriate installation guidance. Do not add a fabricated `package.json` just to affect GitHub's count.

4. **Verify package source metadata.** Confirm the npm-published package metadata's repository URL resolves to the canonical public repository. The source `package.json` currently uses the canonical GitHub URL; verify the publish path does not rewrite or omit it.

5. **Document discoverability accurately.** Add a concise adopter note explaining that GitHub dependency-graph visibility depends on a public repository declaring a real package dependency in a supported manifest, and that processing/display is controlled by GitHub. Keep this separate from the standalone installation path.

6. **Measure outcomes after publication and merge.** Check the repository's dependency graph/dependents view after GitHub has had time to process merged manifests. Record date, observed entries, and any limitations. Treat the sidebar threshold as an external behavior to verify, not as a fixed acceptance threshold or delivery guarantee.

## Risks / Trade-offs

- **Some examples may not use the npm package.** A declaration could mislead maintainers and downstream users. Mitigation: require audit evidence of actual usage before adding it.
- **Lockfiles and package managers differ across repositories.** Mitigation: follow each repository's established tooling and avoid introducing a second package manager.
- **GitHub may not count a repository immediately or may change display behavior.** Mitigation: record observations with dates and make dependency metadata correctness the acceptance criterion.
- **A broad organization inventory can become stale.** Mitigation: keep the checklist with the tracking work and define a repeatable organization search/audit method.
- **Adding a dev dependency may affect installation or security scanning.** Mitigation: use only where the CLI is genuinely part of the repository's development workflow and keep versions aligned with tested releases.

## Rollout

1. Establish and review the repository inventory and dependency-role decisions.
2. Verify the published package metadata.
3. Prepare small repository-specific manifest/lockfile changes for repositories with genuine package usage.
4. Update adopter documentation in the CLI repository.
5. Merge the changes, allow dependency-graph processing, and record the observed result.

## Open Questions

- Which official repositories are currently public and active, and which invoke or install the published npm package rather than using a binary/global installation?
- What release range should each repository use under its own versioning policy?
- Which adopter documentation page is the maintained canonical destination for this guidance?

## Audit snapshot (20 October 2026)

The `flisk-sh` organization repository listing and each candidate's default-branch tree, root package metadata, and README were checked on this date. All 14 primary candidates were public and active in the organization listing. This is a repository-level audit: nested application `package.json` files are counted as application manifests, not evidence that the repository installs the CLI package. “Uses TDK” below means the README documents TDK CLI commands or setup; it does not by itself prove that the published npm package is installed as a project dependency.

| Repository | Root manifest and lockfile | Observed CLI usage | Initial disposition |
|---|---|---|---|
| `tdk-example` | No root Node manifest or lockfile; 4 nested service manifests | README documents `tdk project` and `tdk up` | Uses TDK through operator setup; no project package declaration today |
| `tdk-saas-starter` | Root `package.json` + `bun.lock`; 6 nested service manifests | README documents TDK CLI setup and `tdk up` | Uses TDK; root package currently has no CLI dependency |
| `tdk-restaurant-example` | Root `package.json` + `bun.lock`; 6 nested service manifests | README documents TDK CLI setup and `tdk up` | Uses TDK; root package currently has no CLI dependency |
| `tdk-user-management` | No root Node manifest or lockfile; 6 nested service manifests | README documents `tdk up` | Uses TDK through operator setup; no project package declaration today |
| `tdk-ecommerce-example` | Root `package.json` + `bun.lock`; 2 nested service manifests | README documents `tdk project`, `tdk up`, and a CLI minimum version | Uses TDK; root package currently has no CLI dependency |
| `tdk-erp-system` | Root `package.json`, no root lockfile; 107 service manifests | README documents `tdk up`; labeled 100-service fixture | Fixture uses TDK; root package currently has no CLI dependency |
| `tdk-cli-starter` | Root `package.json`; no root lockfile found | `tdk:dry-run` and `tdk:up` npm scripts invoke `tdk` | Already declares `@flisk-sh/flisk` at `1.3.185`; audit version policy and lockfile in its own repo |
| `create-flisk` | Root `package.json` + `package-lock.json` | README presents a Vite landing page and links to TDK; no CLI command found | Showcase site, not a package consumer based on inspected setup |
| `tdk-agent-stack` | No root Node manifest or lockfile; 2 service manifests | README lists TDK CLI prerequisite and documents `tdk project` / `tdk up` | Uses TDK through operator setup; no project package declaration today |
| `tdk-auth-queue-email-example` | Root `package.json` + `bun.lock`; 4 nested service manifests | README documents TDK CLI setup, `tdk project`, and `tdk up` | Uses TDK; root package currently has no CLI dependency |
| `tdk-thor-storefront` | Root `package.json` + `bun.lock`; 2 nested service manifests | README requires TDK CLI 1.3.75+ and documents `tdk up` | Uses TDK; root package currently has no CLI dependency |
| `tdk-person-crud-example` | Root `package.json` + `bun.lock`; 6 nested service manifests | README documents `tdk up` | Uses TDK; root package currently has no CLI dependency |
| `vercel-store` | Root `package.json` + `bun.lock`; 2 nested service manifests | README asks for the TDK CLI and documents `tdk up` | Uses TDK; root package currently has no CLI dependency |
| `tdk-docker-compose-example` | No Node manifest, lockfile, or `service.json` found | README runs `tdk project` inside Docker Compose | CLI-in-Compose example; likely exception to npm dependency declaration |

Secondary repositories were also checked for direct package declarations and documented use:

- `tdk-skills` documents agent procedures that invoke `tdk` commands, but has no root package manifest; it is a skills catalog, not a CLI package consumer.
- `awesome-tdk-framework` is a curated links repository with no root package manifest; mentions of the CLI are references.
- `flisk-sh/website` and `flisk.sh` have no root package manifest; the latter documents global installation but does not declare a project dependency.
- `tdk-demo-animation` is walkthrough assets with no root package manifest.
- `flisk-sh/releases` provides release artifacts and global-install instructions, with no root package manifest.
- `tdk-service-definitions` has a root manifest/lockfile for AJV validation and 84 service definitions; its README says imported seed data has not been runtime-tested. It does not declare the CLI package.
- `flisk-import` is its own npm package and documents `tdk import` as a core CLI command; its manifest does not depend on `@flisk-sh/flisk`.
- `tdk-app` uses the installed `tdk` CLI and documents a global package install path for its own app, but does not declare `@flisk-sh/flisk` in its manifest.
- Additional public organization repositories `tdk-labs`, `platform`, and `tdk-cli-extensions` were not identified as example/starter repos in this first-wave audit; assess them only if their maintained workflows directly install or invoke the published core package.

This audit verifies current manifests and documented setup, not whether every workflow is run by maintainers. The candidates with no local declaration may be valid future dev-dependency targets if their maintainers choose a project-local installation/command workflow and update their documentation/scripts in the same repository PR. Do not add a declaration by itself to repositories that continue to use only a global or binary CLI. The tracking issue with the inventory and supplied baseline is [#1716](https://github.com/flisk-sh/flisk/issues/1716).
