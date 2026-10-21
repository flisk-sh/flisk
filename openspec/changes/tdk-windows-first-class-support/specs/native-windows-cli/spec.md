## ADDED Requirements

### Requirement: First-run host port selection
The CLI and generated landscape MUST start without requiring host ports 80, 443, or 5432 to be free. The selected host ports MUST be passed consistently to Docker Compose, health checks, and printed URLs. Explicit user configuration MUST take precedence over automatic selection. Automatic selections MUST be bounded, reported with the resulting endpoint and an override instruction, and persisted only as part of an actual startup (never by doctor or dry-run). When the standard localhost hostname cannot be used, the CLI MUST print a numeric loopback URL that reaches the published ingress port.

#### Scenario: Standard ports are occupied
- **WHEN** ports 80, 443, or 5432 are already bound by unrelated host services
- **THEN** `flisk up` selects available fallback ports and starts the landscape without stopping those services
- **AND** prints URLs using the selected ingress port and the matching Postgres host port

#### Scenario: User overrides are configured
- **WHEN** a user explicitly configures ingress or Postgres host ports
- **THEN** those values take precedence over automatic port selection
- **AND** a conflicting explicit value produces a clear actionable error

#### Scenario: Doctor or dry-run checks ports
- **WHEN** `flisk doctor` or `flisk up --dry-run` runs
- **THEN** it does not persist port assignments or alter generated project files

#### Scenario: Wildcard localhost DNS is unavailable
- **WHEN** a Windows/WSL host cannot resolve the generated `*.localhost` hostname
- **THEN** `flisk networks` and successful `flisk up` output include a numeric loopback URL with the selected ingress port

### Requirement: Native platform and architecture mapping
The CLI SHALL recognize `process.platform === "win32"` as Windows and `process.arch === "x64"` as AMD64, while keeping Linux and macOS mappings unchanged. Windows ARM64 SHALL be unsupported in v1. The executable name SHALL be `tdk.exe` on Windows and `flisk` on Unix. Platform paths SHALL use `node:path` APIs.

#### Scenario: Windows AMD64 release asset
- **WHEN** the platform is `win32` and architecture is `x64`
- **THEN** the binary asset name is `flisk-windows-amd64.exe`

#### Scenario: Windows ARM64 is rejected
- **WHEN** the platform is `win32` and architecture is `arm64`
- **THEN** no Windows v1 asset is selected and the CLI explains that Windows v1 supports AMD64 only

#### Scenario: Existing Unix mappings remain stable
- **WHEN** the platform and architecture are Linux x64 or macOS arm64
- **THEN** asset names remain `flisk-linux-amd64` and `flisk-darwin-arm64`

### Requirement: Cross-platform executable lookup
The CLI SHALL resolve Docker, Tilt, Bun, and Flisk on PATH without Unix-only `which` or `command -v` commands. On Windows lookup SHALL consider executable suffixes including `.exe`, `.cmd`, and `.bat`, and SHALL split PATH using the platform path delimiter.

#### Scenario: Windows executable lookup
- **WHEN** a requested tool exists on a Windows PATH directory as an `.exe`, `.cmd`, or `.bat` file
- **THEN** lookup returns its joined path

#### Scenario: Missing command
- **WHEN** no candidate exists in any PATH directory
- **THEN** lookup returns no path without invoking a shell

### Requirement: Windows-safe process execution
CLI child processes SHALL be launched with explicit executable paths and argument arrays, without shell command strings. Windows child processes SHALL set `windowsHide: true`; existing timeouts and Unix behavior SHALL be preserved.

#### Scenario: Start Tilt on Windows
- **WHEN** a Windows command starts Tilt
- **THEN** it resolves `tilt.exe` and spawns it with separate arguments, `shell: false`, and `windowsHide: true`

#### Scenario: Query Docker on Windows
- **WHEN** a Windows command queries Docker
- **THEN** it invokes the resolved Docker executable through an argument-safe file execution API

### Requirement: Windows upgrade installation detection
The upgrade command SHALL use the shared asset mapping and Windows-compatible file operations. A compiled `tdk.exe` process SHALL upgrade the executable identified by `process.execPath`; an npm-installed `node.exe` entry point SHALL print `use npm install -g @flisk-sh/flisk@latest` and exit successfully. Other installation forms SHALL fail with a clear message. Windows engine extraction SHALL target `join(dirname(tdkExePath), "tdk-cli")`; dry run SHALL print `flisk-windows-amd64.exe`.

#### Scenario: Dry run reports the Windows artifact
- **WHEN** a Windows AMD64 user runs `flisk upgrade --dry-run`
- **THEN** the planned asset is `flisk-windows-amd64.exe`

#### Scenario: npm installation upgrade
- **WHEN** upgrade runs from the npm Node entry point on Windows
- **THEN** it prints the specified npm install command and exits without replacing npm files with an executable

#### Scenario: Unsupported installation form
- **WHEN** the running process is neither a compiled Flisk binary nor an npm installation
- **THEN** upgrade stops with a clear installation detection error

### Requirement: Windows doctor runtime checks
`flisk doctor` SHALL check Docker, Tilt, and Bun on PATH, warn when Bun is missing, and check Node only for npm installs. It SHALL run Docker version/info, Tilt version, and Docker Compose version checks and enforce Docker Engine 25+ and Compose 2.20.2+. It SHALL report Docker-not-running with the exact next step `Start Docker Desktop and wait until it says Running.` and reject Windows-container mode with `Switch Docker Desktop to Linux containers. Flisk does not run Windows containers.` Missing Tilt SHALL say `tilt.exe not found on PATH. Install Tilt from https://docs.tilt.dev/install.html`.

#### Scenario: Docker Desktop is stopped
- **WHEN** Docker daemon checks fail because the daemon is not running
- **THEN** doctor reports that Docker is not running and tells the user to start Docker Desktop and wait until it says Running

#### Scenario: Windows containers are selected
- **WHEN** Docker reports a Windows container daemon
- **THEN** doctor fails and directs the user to switch Docker Desktop to Linux containers

#### Scenario: Bun is absent
- **WHEN** Bun cannot be found on PATH
- **THEN** doctor warns that generated services need Bun while continuing other checks

### Requirement: Windows port and DNS diagnostics
On Windows doctor SHALL retain a working Node address-bind probe for ports 80, 443, and 5432. When ownership details are needed, it SHALL query listening connections with `powershell.exe` and `Get-NetTCPConnection`; it SHALL inspect Hyper-V excluded TCP ranges with `netsh interface ipv4 show excludedportrange protocol=tcp`. An excluded-range collision SHALL warn that Windows reserved the port for Hyper-V/WSL and give the specified remediation. If IIS / World Wide Web Publishing listens on port 80, doctor SHALL identify it by name. Doctor SHALL resolve `tdk.localhost` and a sample host such as `example.tdk.localhost` and report the exact DNS failure message when they do not resolve to loopback. It SHALL recommend Docker Desktop project-drive file sharing and warn, without changing global settings, when `core.autocrlf` is true.

#### Scenario: Hyper-V excludes a required port
- **WHEN** port 80, 443, or 5432 falls in a reported excluded range
- **THEN** doctor warns that Windows reserved the port for Hyper-V/WSL and explains the configured fix guidance

#### Scenario: Wildcard localhost does not resolve
- **WHEN** either checked Flisk hostname fails to resolve to `127.0.0.1` or `::1`
- **THEN** doctor prints the exact Windows DNS failure guidance and hosts-file lines/instructions

#### Scenario: Required ports are available
- **WHEN** the bind probes show ports 80, 443, and 5432 available
- **THEN** doctor passes the port availability check

### Requirement: Windows network output includes numeric URLs
On Windows, `flisk networks` SHALL print both the hostname URL and a usable `127.0.0.1:<port>` URL for routed services. Linux and macOS routing defaults SHALL remain unchanged.

#### Scenario: Show hostname and loopback routes
- **WHEN** a Windows user runs `flisk networks` for a routed service
- **THEN** output includes its hostname URL and numeric loopback URL

### Requirement: PowerShell completion installation
The CLI SHALL support `flisk completion --install --shell powershell` by creating or updating the current PowerShell profile and placing completion content between unique `# TDK-CLI-COMPLETION-START` and `# TDK-CLI-COMPLETION-END` markers. It SHALL create a missing profile and preserve unrelated profile content and existing Bash, Zsh, and Fish completion behavior.

#### Scenario: Install PowerShell completion
- **WHEN** a user installs PowerShell completion and the profile does not exist
- **THEN** the CLI creates the profile and writes the marked native command completer

#### Scenario: Reinstall completion
- **WHEN** a user installs completion again
- **THEN** the profile contains one updated marked block and unrelated text remains intact

### Requirement: Generated project compatibility on Windows hosts
Windows-hosted generated projects SHALL continue to use Linux containers and project-relative paths suitable for Tilt and Docker Desktop. The CLI SHALL not emit host-side Unix `chmod` steps or silently remap ports 80, 443, and 5432. Container-side Linux scripts and existing project port overrides SHALL remain valid.

#### Scenario: Windows project scaffolding
- **WHEN** a Windows user scaffolds a project
- **THEN** generated containers remain Linux-based and host mounts use supported project-relative paths

#### Scenario: Port collision
- **WHEN** a configured default port is occupied or excluded
- **THEN** doctor explains the problem and does not silently remap it unless an existing project port override applies
