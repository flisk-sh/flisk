## Why

Flisk resources are spread across organization repositories, documentation, examples, gists, articles, and community projects, making it hard for developers to discover the full ecosystem or know where to start. A public, community-friendly directory will make the Flisk landscape easier to explore and share while giving the organization profile a clear destination for ecosystem links.

## What Changes

- Create a public GitHub repository named `awesome-tdk-framework` as a curated directory for the Flisk ecosystem.
- Keep the repository intentionally minimal with a root `README.md` catalog and a root `CONTRIBUTING.md` guide; do not add source code, data files, assets, or automation/configuration files.
- Make the README the complete catalog of links, grouped into a broad, navigable taxonomy covering official projects, getting started, documentation, examples, templates, extensions, integrations, deployment, observability, security, community, and learning resources.
- Include GitHub repositories, gists, articles, videos, packages, tools, and other relevant links, with concise descriptions and clear labels that distinguish official from community-maintained resources.
- Keep a short contribution pointer in the README and put detailed inclusion criteria, labels, and submission steps in `CONTRIBUTING.md`.
- Link the repository from the existing Flisk organization profile and other appropriate entry points.

## Capabilities

### New Capabilities
- `tdk-resource-landscape`: A minimal public catalog organized in README, with a dedicated contribution guide.

### Modified Capabilities

## Impact

- New public GitHub repository: `tdk-landscape/awesome-tdk-framework`.
- Existing organization profile README in `tdk-landscape-github` gains a prominent link to the catalog.
- Initial content draws from existing Flisk repositories and public resources; external links must be checked and described accurately during implementation.
- No runtime code, APIs, or package dependencies are introduced.
