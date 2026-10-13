# Tasks

## 1. Dev Container configuration
- [ ] 1.1 Add `.devcontainer/devcontainer.json` based on an official Node 22 image, installing Bun and running `cd cli && bun install` in `postCreateCommand`
- [ ] 1.2 Include a minimal set of useful VS Code extensions (TypeScript, ESLint, etc.)
- [ ] 1.3 (Optional) Add a second configuration or documented override that enables Docker-in-Docker and Tilt for contributors who need to try `tdk up`; keep the default light

## 2. Verification
- [ ] 2.1 Open the repository in a real Codespaces instance (or “Dev Containers: Reopen in Container”) and confirm the post-create install succeeds
- [ ] 2.2 Confirm `cd cli && bun run typecheck && bun run lint && bun run test` (or the package’s equivalent) pass inside the container
- [ ] 2.3 Note the exact environment and commands tried in the pull request

## 3. Documentation
- [ ] 3.1 Add an “Open in GitHub Codespaces” badge and short section to `CONTRIBUTING.md`
- [ ] 3.2 Update the short contributor guide (`docs/contributing/01-first-change.md`) if it is the primary entry point, so the Dev Container path is visible
- [ ] 3.3 Briefly mention the relationship to the separate agent-host Dev Container (if both land) so readers know which one to use

## 4. Cleanup
- [ ] 4.1 Run `openspec validate add-contributor-devcontainer --strict` (or the equivalent check used by the repository)
- [ ] 4.2 Ensure no secrets, large binaries, or unnecessary files are committed under `.devcontainer/`
