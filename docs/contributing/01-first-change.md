# 1. Get ready to make a change

Follow these steps once. They set up the tools used by the TDK CLI and its checks.

## Fastest way: Dev Container / Codespaces

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/tdk-landscape/tdk-cli-core?quickstart=1)

Or clone the repo and use **Dev Containers: Reopen in Container** in VS Code.

The default container gives you Node.js 22 and Bun and runs `bun install` for you. After it starts you can immediately run:

```bash
bun run typecheck
bun run lint
bun run test
```

Docker and Tilt are optional and not part of the default container. Add them only if you need to exercise a full local stack.

## You need (local install)

- Git
- [Bun](https://bun.sh)
- Node.js 22.12 or newer
- Docker and [Tilt](https://docs.tilt.dev/install.html) only if you need to run TDK services or check a full local environment

## Copy the repo to your computer

Open a terminal and run:

```bash
git clone https://github.com/tdk-landscape/tdk-cli-core.git
cd tdk-cli-core
bun install
git switch -c my-change
```

Replace `my-change` with a short name, for example `docs-new-framework-guide`.

## Find one change

1. Open the [good first issues](https://github.com/tdk-landscape/tdk-cli-core/labels/good%20first%20issue) or [help wanted issues](https://github.com/tdk-landscape/tdk-cli-core/labels/help%20wanted).
2. Read the issue and check whether someone is already working on it.
3. Comment `I'll take this` (or `I would like this one`); a bot assigns you and adds the `claimed` label. If there is no issue, open one describing the change before starting a large feature.
4. Use [the feature recipes](02-feature-recipes.md) to find the likely files and checks.

## When to write a change proposal

Use OpenSpec when a change affects a user-facing contract, a manifest or generated format, or several subsystems. The [Vue provider change](../../openspec/changes/archive/2026-09-28-add-vue-frontend-adapter/proposal.md) is a completed example with a proposal, design, specs, and tasks. If the `openspec` command is not installed on your machine, ask in the issue before starting a cross-cutting change.

From the repository root:

```bash
openspec list
openspec new change "short-change-name"
openspec status --change "short-change-name"
```

Follow the instructions printed by OpenSpec to create the proposal, design, specs, and tasks that apply. A typo fix, link correction, or small isolated change usually does not need a proposal.

## Run a quick check

From the repository root, the CLI checks are:

```bash
bun run typecheck
bun run lint
bun run test
```

Run the checks again after your last edit. If a check fails, include the failure in your PR and say what you tried. See [the PR guide](03-open-a-pr.md) for area-specific checks.
