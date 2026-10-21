# Tasks

## 1. Dev Container configuration
- [x] 1.1 Add `.devcontainer/devcontainer.json` based on an official Node 22 image, installing Bun and running `bun install` at the repository root in `postCreateCommand`
- [x] 1.2 Include a minimal set of useful VS Code extensions (Biome, TypeScript)
- [ ] 1.3 (Optional) Add a second configuration or documented override that enables Docker-in-Docker and Tilt for contributors who need to try `flisk up`; keep the default light

## 2. Verification
- [x] 2.1 Open the repository in a real Codespaces instance (or “Dev Containers: Reopen in Container”) and confirm the post-create install succeeds
- [x] 2.2 Confirm `bun run typecheck && bun run lint && bun run test` at the repository root pass inside the container
- [x] 2.3 Note the exact environment and commands tried in the pull request

## 3. Documentation
- [x] 3.1 Add an “Open in GitHub Codespaces” badge and short section to `CONTRIBUTING.md`
- [x] 3.2 Update the short contributor guide (`docs/contributing/01-first-change.md`) if it is the primary entry point, so the Dev Container path is visible
- [x] 3.3 Briefly mention the relationship to the separate agent-host Dev Container (if both land) so readers know which one to use

## 4. Cleanup
- [x] 4.1 Run `openspec validate add-contributor-devcontainer --strict` (or the equivalent check used by the repository)
- [x] 4.2 Ensure no secrets, large binaries, or unnecessary files are committed under `.devcontainer/`
