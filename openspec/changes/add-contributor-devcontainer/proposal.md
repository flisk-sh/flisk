# Proposal: add a Dev Container / Codespaces config for one-click contributor setup

## Why

CONTRIBUTING.md currently requires Bun, Node.js 22.12+, and (for full local stacks) Docker and Tilt before a newcomer can run a single test. Most CLI changes only need the TypeScript toolchain. Installing four tools is a high barrier for good-first-issue and Hacktoberfest contributors, especially on machines without admin rights or with existing conflicting versions. A Dev Container (and GitHub Codespaces support) lets anyone open the repository in the browser or VS Code and be ready in about a minute.

## What Changes

- Add a lightweight `.devcontainer/devcontainer.json` (plus a Dockerfile only if the official image is insufficient) that provides Node.js 22 and Bun, then runs `bun install` at the repository root via `postCreateCommand`.
- Keep the default configuration light: no Docker-in-Docker and no Tilt. Most `cli/` work can typecheck, lint, and test without them.
- Optionally provide a second configuration (or feature toggle) that adds the Docker-in-Docker feature and Tilt so contributors can try `flisk up` when needed. Document when to use each.
- Verify that `bun run typecheck && bun run lint && bun run test` (root scripts) pass inside the container.
- Add an “Open in GitHub Codespaces” badge and short section to `CONTRIBUTING.md` (and the short contributor guide if appropriate).
- Note in the PR what was tested (Codespaces and/or “Dev Containers: Reopen in Container”).

## Capabilities

### New Capabilities

- `contributor-devcontainer`: A ready-to-use development container for working on the Flisk CLI repository itself, optimized for the common case of CLI typecheck/lint/test.

### Modified Capabilities

None. This does not change the published Flisk CLI contract, generated stacks, or the agent-host runtime (which remains a separate concern for running the published `flisk` binary).

## Impact

- New files: `.devcontainer/devcontainer.json` (and optional Dockerfile or secondary config).
- Documentation: `CONTRIBUTING.md` and possibly `docs/contributing/01-first-change.md`.
- No changes to the CLI runtime, package dependencies, CI workflows, or generated service artifacts.
- Overlaps conceptually with the reference Dev Container in `agent-host-runtime` (which focuses on running the published `flisk` with host Docker). This change is specifically for contributors editing the `tdk-cli-core` source tree and can stay lighter.
