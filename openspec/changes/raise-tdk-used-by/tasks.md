# Tasks: grow legitimate Flisk CLI dependents

## 1. Audit the official landscape

The repositories below are audit candidates, not yet-confirmed consumers. The suggested `devDependency` role applies only if the audit confirms that the repository genuinely installs or invokes the published npm package; do not add it solely to affect GitHub's count. Start with these candidates, then record ecosystem, manifest, lockfile, activity, and actual CLI usage for each.

| Repository | URL | Why it belongs | Suggested disposition |
|---|---|---|---|
| `tdk-example` | https://github.com/flisk-sh/tdk-example | Smallest official multi-service example | `devDependency` if genuine use is confirmed |
| `tdk-saas-starter` | https://github.com/flisk-sh/tdk-saas-starter | Polished SaaS dashboard + checkout starter | `devDependency` if genuine use is confirmed |
| `tdk-restaurant-example` | https://github.com/flisk-sh/tdk-restaurant-example | Restaurant ops example (reservations, kitchen, floor) | `devDependency` if genuine use is confirmed |
| `tdk-user-management` | https://github.com/flisk-sh/tdk-user-management | Enterprise identity / SCIM / OIDC example | `devDependency` if genuine use is confirmed |
| `tdk-ecommerce-example` | https://github.com/flisk-sh/tdk-ecommerce-example | Vue + Hono storefront example | `devDependency` if genuine use is confirmed |
| `tdk-erp-system` | https://github.com/flisk-sh/tdk-erp-system | 100-service scale fixture | `devDependency` if genuine use is confirmed |
| `tdk-cli-starter` | https://github.com/flisk-sh/tdk-cli-starter | Cloud-dev starter / template | `devDependency` if genuine use is confirmed |
| `create-flisk` | https://github.com/flisk-sh/create-flisk | Landing page / create-app style starter | `devDependency` if genuine use is confirmed |
| `tdk-agent-stack` | https://github.com/flisk-sh/tdk-agent-stack | AI agent + MCP + Postgres + NATS template | `devDependency` if genuine use is confirmed |
| `tdk-auth-queue-email-example` | https://github.com/flisk-sh/tdk-auth-queue-email-example | OIDC + NATS + Mailpit example | `devDependency` if genuine use is confirmed |
| `tdk-thor-storefront` | https://github.com/flisk-sh/tdk-thor-storefront | Thor Commerce storefront landscape | `devDependency` if genuine use is confirmed |
| `tdk-person-crud-example` | https://github.com/flisk-sh/tdk-person-crud-example | Person CRUD (React/Express/Mongo/Redis/RabbitMQ) | `devDependency` if genuine use is confirmed |
| `vercel-store` | https://github.com/flisk-sh/vercel-store | Vercel-style storefront landscape | `devDependency` if genuine use is confirmed |
| `tdk-docker-compose-example` | https://github.com/flisk-sh/tdk-docker-compose-example | CLI-in-Compose example | Audit; may be an exception |

Secondary audit-only candidates, generally expected not to need a package declaration:

- `tdk-skills` — agent skills catalog
- `awesome-tdk-framework` — curated links
- `flisk-sh/website` / `flisk.sh` — docs and install site
- `tdk-demo-animation` — walkthrough assets
- `flisk-sh/releases` — binary releases only
- `tdk-service-definitions` — `service.json` registry
- `flisk-import` / `tdk-app` — related tools; audit if they invoke the CLI as a package

- [x] 1.1 Audit the primary candidate repositories listed above; record URL, activity, ecosystem, manifest, lockfile, actual CLI usage, and disposition. Include additional public examples, starters, templates, and fixtures discovered under `flisk-sh`. (Snapshot recorded in `design.md`.)
- [x] 1.2 For each candidate, verify whether its workflow genuinely installs or uses `@flisk-sh/flisk` and identify the appropriate dependency role. (Only `tdk-cli-starter` currently declares the package; other README-documented Flisk usage requires a separately installed CLI and has no repo-local core dependency.)
- [x] 1.3 Open repository-specific PRs for the confirmed Flisk CLI project workflows, adding the appropriate development dependency and lockfile. Twelve PRs are listed in tracking issue #1716; all twelve consumer PRs have merged as of 20 October 2026.
- [x] 1.4 Record exclusions and non-Node, binary-only, documentation-only, and CLI-in-Compose exceptions with reasons; do not add manifests solely to influence GitHub's count. (See audit snapshot in `design.md`.)

## 2. Verify package metadata

- [x] 2.1 Inspect the published npm package metadata and confirm its repository URL points to `https://github.com/flisk-sh/flisk`. Verified 20 October 2026: npm latest `1.3.186`, repository `git+https://github.com/flisk-sh/flisk.git`.
- [x] 2.2 If the publish artifact does not preserve the canonical repository link, correct the package metadata and add a verification step to the release process. No correction was needed; published metadata is canonical.

## 3. Update genuine consumers

- [x] 3.1 Add the CLI to the appropriate development dependency section in the 12 confirmed project-local workflows. Each declaration is pinned to published version `1.3.186`; see tracking issue #1716.
- [x] 3.2 Update each consumer repository's lockfile using its existing package manager (npm for `tdk-cli-starter`, Bun for the other 11).
- [x] 3.3 For non-Node repositories, document the chosen integration or the reason no npm declaration is appropriate. (See audit snapshot in `design.md`.)
- [x] 3.4 Review each repository change against its README setup and local CLI scripts; verify the manifest/lockfile version match and run `git diff --check` in each checkout.

## 4. Document adopter guidance

- [x] 4.1 Identify the canonical maintained adopter documentation page in `flisk`: `ADOPTERS.md`.
- [x] 4.2 Explain that public dependency-graph recognition requires genuine dependency declarations in supported manifests and that GitHub controls processing/display timing. Added to `ADOPTERS.md`.
- [x] 4.3 Keep standalone/global CLI installation guidance independent from package dependency declarations. Clarified in `ADOPTERS.md`.

## 5. Track and measure

- [x] 5.1 Open or update [tracking issue #1716](https://github.com/flisk-sh/flisk/issues/1716) with audited repositories, dispositions, and the proposal's baseline dependents observation.
- [x] 5.2 After all consumer changes merged, re-checked GitHub's dependency graph/dependents view on 20 October 2026: GitHub displayed 5 repositories and 0 packages for `@flisk-sh/flisk` at https://github.com/flisk-sh/flisk/network/dependents. All twelve consumer PRs have merged; GitHub controls graph processing and display criteria.
- [x] 5.3 Record the display limitation and that processing timing is controlled by GitHub; no processing delay has been measured yet. Do not create artificial dependencies to reach a target number.
- [x] 5.4 Confirm adopter documentation and package metadata are on `main` and discoverable. Verified 20 October 2026: `ADOPTERS.md` guidance is merged, and npm latest `1.3.186` retains the canonical repository URL.

## Optional: GitHub Packages visibility

This is independent of npm dependency-graph recognition and the “Used by” count. The CLI is published to the public npm registry; an empty GitHub Packages tab does not block npm-based dependents from appearing.

- [x] O.1 Decide whether to also publish `@flisk-sh/flisk` to GitHub Packages (`npm.pkg.github.com`) in addition to npmjs.com. Decision: no; it is optional and unrelated to npm dependency-graph recognition.
- [x] O.2 If approved, configure the GitHub Packages registry and authenticated release workflow, publish a version, and connect the package to `flisk-sh/flisk` so it appears on the repository's Packages tab. Not applicable because O.1 was declined.
