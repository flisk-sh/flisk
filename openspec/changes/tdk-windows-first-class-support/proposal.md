## Why

Flisk currently supports macOS and Linux, while native Windows users cannot install the CLI reliably or run its Docker and Tilt workflow. First-class Windows 10/11 and Windows Server support on AMD64 closes this platform gap while keeping the existing Unix experience stable and making the Windows-specific DNS, ports, Docker mode, and installation requirements explicit.

## What Changes

- Add shared platform and PATH discovery helpers, Windows-aware upgrade behavior, and Windows-compatible doctor checks for host tools, Docker, ports, and `*.localhost` DNS.
- Publish a Windows AMD64 CLI binary and checksums; add a PowerShell installer with checksum verification, per-user installation, PATH setup, and robust engine extraction.
- Add Windows shell completion, document native Windows setup and troubleshooting, and remove outdated statements that Windows is untested.
- Add Windows CI coverage for CLI build/typecheck, help output, targeted unit tests, and Windows binary artifact validation without claiming a Docker end-to-end boot.
- Preserve Linux and macOS behavior and generated Linux containers. Windows ARM64, Windows containers, package-manager distribution, and a full Windows `flisk up` CI test remain out of scope.
- Require a human validation run on Windows 11 AMD64 before declaring the platform release-ready.

## Capabilities

### New Capabilities

- `native-windows-cli`: Native Windows AMD64 install, CLI execution and upgrade, runtime diagnostics, shell integration, and project lifecycle behavior.
- `windows-release-distribution`: Windows binary publication, PowerShell installation, checksum verification, CI validation, and platform documentation.

### Modified Capabilities

- None. Existing OpenSpec capabilities do not define these platform requirements.

## Impact

- CLI source and tests under `cli/src`, especially platform utilities, upgrade, doctor, completions, and project lifecycle commands.
- Binary release scripts and GitHub workflows in `flisk`.
- The separate `flisk-sh/releases` and `flisk.sh` repositories, plus Flisk website and organization documentation where platform support is described.
- Native Windows requirements: PowerShell, `tar.exe`, `Get-FileHash`, Docker Desktop in Linux container mode, Tilt for Windows, and Bun for generated services; Node.js is optional except for npm installations.
