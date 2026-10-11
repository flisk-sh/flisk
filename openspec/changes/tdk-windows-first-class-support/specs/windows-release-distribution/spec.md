## ADDED Requirements

### Requirement: Windows AMD64 binary release
The release pipeline SHALL produce `tdk-windows-amd64.exe` from Bun's `bun-windows-x64` target, include it in checksums and the binary ZIP, and preserve all existing Unix asset names and the `tdk-cli-engine.tar.gz` engine archive. CI SHALL confirm the resulting Windows executable is non-empty and has the PE `MZ` signature.

#### Scenario: Release asset is built and packaged
- **WHEN** the binary release script completes
- **THEN** the Windows AMD64 executable exists, is checksummed, and is included in the binary ZIP

#### Scenario: Windows binary signature check
- **WHEN** the cross-compiled executable is checked in CI
- **THEN** the file is non-empty and begins with the PE `MZ` signature

### Requirement: PowerShell Windows installer
The website repository SHALL provide `install.ps1` for native Windows AMD64. It SHALL reject unsupported Windows ARM64, download the latest Windows executable, engine archive, and checksums, verify the executable SHA-256 against its checksum entry, install to `TDK_INSTALL_DIR` or `%LOCALAPPDATA%\tdk\bin`, place the engine in the adjacent `tdk-cli` folder, and add the install directory to user PATH only when missing. It SHALL handle tar implementations without `--strip-components` through temporary extraction and flattening. It SHALL not require Administrator rights for the default install and SHALL print the installed path/version and new-terminal instruction.

#### Scenario: Checksum mismatch fails installation
- **WHEN** the downloaded executable hash differs from `checksums.txt`
- **THEN** the installer stops and reports the expected and actual checksum values

#### Scenario: Standard install uses per-user location
- **WHEN** no custom install directory is set
- **THEN** files install under `%LOCALAPPDATA%\tdk\bin` and PATH is updated at user scope

#### Scenario: Older tar lacks strip-components
- **WHEN** engine extraction does not support `--strip-components`
- **THEN** the installer extracts to a temporary directory and moves the inner files into `tdk-cli` without an extra nested folder

### Requirement: Windows installation documentation
Installation instructions SHALL document both `irm https://tdk-landscape.github.io/install.ps1 | iex` and the safe two-step PowerShell download/run flow, plus manual Windows download/extraction commands. Platform wording SHALL consistently state `Supported platforms: macOS, Linux, and Windows 10/11 (AMD64). Windows uses Docker Desktop Linux containers. WSL2 Ubuntu works as Linux.` All locations that currently call Windows untested and are named in the change plan SHALL be updated. The Windows problems page SHALL cover only Docker Desktop stopped/Windows containers, ports or Hyper-V exclusions, `*.localhost` DNS, and project-drive file sharing.

#### Scenario: PowerShell install instructions
- **WHEN** a user follows the Windows quickstart
- **THEN** it lists Docker Desktop Linux containers, Tilt for Windows, the PowerShell installer, a new shell, `tdk doctor`, scaffold, up, and networks steps

#### Scenario: Manual Windows installation
- **WHEN** a user chooses manual installation
- **THEN** documentation includes PowerShell commands to download the executable, engine archive, checksums, and extract the engine

### Requirement: Windows smoke CI and support claims
A `windows-latest` workflow SHALL configure Node 22, install dependencies using the repository's existing convention, build or typecheck the CLI, run `tdk --help` through the actual CLI entry point, and run unit tests for platform mapping, upgrade asset naming, and PATH lookup. CI SHALL not fake a Docker end-to-end boot when Docker is unavailable. Windows SHALL not be claimed as supported until Windows smoke CI, binary validation, installer and docs are present and the human Windows 11 AMD64 acceptance checklist has passed.

#### Scenario: Windows smoke workflow
- **WHEN** the workflow runs on `windows-latest`
- **THEN** it executes the build/typecheck, CLI help, and targeted unit checks without requiring Docker

#### Scenario: Release readiness
- **WHEN** the implementation is prepared for a Windows support release
- **THEN** all checklist items are recorded as passed on a real Windows 11 AMD64 machine before support is claimed
