# Design: contributor Dev Container / Codespaces

## Context

The repository’s contributor path currently expects a local install of Bun and Node.js 22.12+. Docker and Tilt are only required when exercising full stack generation and `tdk up`. Most open issues under the CLI area can be validated with `bun run typecheck`, `bun run lint`, and `bun run test`.

GitHub Codespaces and the VS Code Dev Containers extension both honor a `.devcontainer/devcontainer.json` that follows the Development Container Specification. Official images such as `mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm` already supply a recent Node.js; Bun can be added via a feature or a short `postCreateCommand`.

An existing OpenSpec change (`agent-host-runtime`) proposes a reference Dev Container oriented around running the published `tdk` binary with docker-outside-of-docker. That remains valuable for agents and end users. This change is narrower: a fast environment for editing and testing the CLI source itself.

## Goals / non-goals

- Goals:
  - One-click open in Codespaces or “Reopen in Container”.
  - Node.js 22 + Bun available on PATH.
  - `bun install` (or the repo’s equivalent) completes automatically.
  - `typecheck`, `lint`, and `test` succeed for the CLI package without extra manual steps.
  - Clear documentation of the light default versus the optional full (Docker + Tilt) variant.
- Non-goals:
  - Replacing local development for maintainers who already have the tools.
  - Supporting WebContainers.
  - Pre-building and publishing a custom image (can be a later optimization).
  - Changing how TDK generates stacks for end-user projects.
  - Docker-in-Docker or Tilt in the default configuration (they increase startup time and complexity).

## Decisions

1. **Prefer an official image + features over a custom Dockerfile when possible.** Start from a Node 22 TypeScript image and install Bun via the official Bun feature or a pinned install script in `postCreateCommand`. A Dockerfile is only added if the feature approach proves unreliable.
2. **Default configuration is light.** It installs Node, Bun, and project dependencies. It does not enable Docker-in-Docker or Tilt. This keeps Codespaces startup fast and avoids privileged containers for the common case.
3. **Optional second configuration for full stack work.** If a second `devcontainer.json` (or a `features` override documented in a comment) is added, place it under `.devcontainer/full/` or document a clear way to enable it. The default remains the light one so “Open in Codespaces” does not surprise newcomers with a long build.
4. **postCreateCommand runs the install.** `cd cli && bun install` (adjust path if the monorepo layout differs) so the environment is ready for immediate `bun run typecheck`.
5. **VS Code extensions.** Include the essential ones already useful for the repo (ESLint, Prettier if used, TypeScript language features). Keep the list short.
6. **Codespaces badge.** Standard markdown badge linking to the create-codespace URL, placed near the top of the setup section in `CONTRIBUTING.md`.
7. **Relationship to agent-host-runtime.** The two Dev Containers serve different audiences. This one prioritizes contributor speed for source edits. The other prioritizes a working Docker socket for the published CLI. They may share an image base later, but they are specified separately so each can stay focused.

## Risks

- Bun installation inside the container may need a specific feature version or PATH adjustment; the PR must demonstrate a green typecheck/lint/test run.
- Docker-in-Docker (if offered) has known limitations with Tilt bind mounts and layer caching; document them and prefer docker-outside-of-docker only when the host socket is available (Codespaces supports this differently than local VS Code).
- First Codespaces creation is slower than subsequent ones; the light config minimizes this.
- Contributors on very restricted networks may still hit package-registry issues; the container does not solve every network problem.

## Open questions

- Exact Bun feature or install method that is most reliable on the chosen base image (to be confirmed during implementation).
- Whether a second named configuration is worth the extra files, or whether a short comment + documented `devcontainer.json` override is sufficient for the optional heavy path.
- Whether `npm` scripts or `bun` scripts are the canonical check commands inside the container (follow whatever `package.json` in `cli/` already exposes).
