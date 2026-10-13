## ADDED Requirements

### Requirement: Lightweight contributor Dev Container
The repository SHALL contain a `.devcontainer/devcontainer.json` that provides Node.js 22 and Bun, installs the CLI package dependencies, and is sufficient to run the repository’s TypeScript quality checks without a local install of those tools.

#### Scenario: New contributor opens the repository
- **WHEN** a contributor opens the repository in GitHub Codespaces or uses “Dev Containers: Reopen in Container” in VS Code
- **THEN** the container starts with Node.js 22 and Bun on PATH, project dependencies are installed, and `cd cli && bun run typecheck && bun run lint && bun run test` (or the equivalent scripts defined by the package) exit zero

### Requirement: Default configuration stays light
The default Dev Container configuration SHALL NOT require Docker-in-Docker or Tilt. Full-stack experimentation (`tdk up`) SHALL be optional and clearly documented as a separate step or configuration.

#### Scenario: CLI-only change
- **WHEN** a contributor works on a change under `cli/` that does not exercise stack generation
- **THEN** they can complete typecheck, lint, and unit tests inside the default container without enabling extra features

### Requirement: Codespaces entry point is documented
`CONTRIBUTING.md` SHALL include an “Open in GitHub Codespaces” badge and a short section explaining that the Dev Container is the fastest way to start contributing, with a pointer to the optional full configuration if Docker/Tilt are needed.

#### Scenario: Reader of CONTRIBUTING.md
- **WHEN** a newcomer reads the quick-setup section
- **THEN** they see a one-click Codespaces option and understand that most CLI work does not require a local Docker or Tilt install
