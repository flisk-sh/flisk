## ADDED Requirements

### Requirement: WSL2 Ubuntu is the supported Windows boot path
Windows landscape boot documentation SHALL identify WSL2 Ubuntu with Docker Desktop integration as the Windows path. Native Windows SHALL be described as CLI inspection only, with `flisk up` unsupported by default. The native escape hatch SHALL be documented as unsupported.

#### Scenario: User follows Windows platform guidance
- **WHEN** a user reads the platform support documentation
- **THEN** it directs landscape boot users to WSL2 Ubuntu with Docker Desktop integration and states native Windows `flisk up` is unsupported

### Requirement: WSL2 setup is documented as runnable commands
`docs/wsl2.md` SHALL provide a concise command list for setting up from a clean Ubuntu WSL distribution. It SHALL include Docker Desktop integration and explain that keeping the project outside `/mnt/c` improves hot reload.

#### Scenario: User follows WSL2 setup instructions
- **WHEN** a user starts from a clean Ubuntu WSL environment and follows `docs/wsl2.md`
- **THEN** the documented commands guide installation, Docker integration, doctor, and example startup

### Requirement: WSL2 smoke script exercises the example path
`scripts/wsl2-smoke.sh` SHALL run doctor, start the example, exercise its write path, and clean up the stack.

#### Scenario: WSL2 smoke completes
- **WHEN** a user runs `scripts/wsl2-smoke.sh` in supported WSL2 Ubuntu with Docker Desktop integration
- **THEN** doctor and example startup pass, the write path succeeds, and the stack is stopped

### Requirement: WSL CI does not replace the Ubuntu gate
If GitHub does not provide a suitable WSL runner, any WSL CI job SHALL be report-only and SHALL NOT replace the required Ubuntu `example-e2e` gate.

#### Scenario: WSL runner is unavailable
- **WHEN** no suitable WSL runner is available for GitHub CI
- **THEN** the WSL smoke script and documentation remain available, while Ubuntu `example-e2e` stays the required gate

### Requirement: README stability claim changes only after evidence is green
The current 1.x caveat SHALL remain until requirements for `flisk up` behavior, generation safety, manifest schema behavior, and the real example E2E are green on main. Only then may README support copy state macOS and Linux are supported, Windows is via WSL2 Ubuntu, native Windows is CLI-inspection-only, and 1.x generated files are a contract verified in CI.

#### Scenario: Required implementation evidence is not green
- **WHEN** one or more gated requirements are not green on main
- **THEN** README retains the current 1.x caveat

#### Scenario: Required implementation evidence is green
- **WHEN** all gated requirements are green on main
- **THEN** README may replace the caveat with the supported-platform and generated-file-contract status line
