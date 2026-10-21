## ADDED Requirements

### Requirement: Windows executable is a required release asset
Each release promoted as latest SHALL include `tdk-windows-amd64.exe`, `tdk-cli-engine.tar.gz`, `checksums.txt`, the versioned binary ZIP, and the four existing Unix binaries. The executable SHALL be non-empty, begin with the PE `MZ` signature, have a SHA-256 entry in `checksums.txt`, and appear in the ZIP. The published GitHub release asset list SHALL include the executable before the release is promoted as latest.

#### Scenario: Candidate assets pass validation
- **WHEN** the release candidate is prepared for publication
- **THEN** every required asset exists, the executable is non-empty and begins with `MZ`, and its checksum and ZIP entries are present

#### Scenario: Release asset verification fails
- **WHEN** a required Windows asset check fails or the published release listing omits the executable
- **THEN** the release workflow fails and the candidate is not promoted as latest

### Requirement: Windows release candidate passes runtime smoke
The release pipeline SHALL run the exact candidate executable on a Windows AMD64 runner with the candidate engine archive extracted to a sibling `tdk-cli` directory. The smoke SHALL verify the executable and engine archive checksums, require `tdk.exe --version` to equal the candidate version, and run `tdk.exe runtime --check-assets --json`. The runtime check SHALL confirm that the resolved asset root is the adjacent `tdk-cli` directory and that required engine, template, and Docker-template assets can be read. The smoke SHALL NOT require Docker Desktop and SHALL NOT claim that `flisk up` works on Windows.

#### Scenario: Windows candidate smoke passes
- **WHEN** checksums match, the version matches the candidate, and the runtime check resolves all required assets from the adjacent engine directory
- **THEN** the Windows smoke gate passes and the candidate may proceed to the remaining release gates

#### Scenario: Windows candidate smoke fails
- **WHEN** checksum verification, version comparison, or runtime asset resolution fails
- **THEN** publication SHALL stop before npm publication and latest promotion

### Requirement: PowerShell installer verifies engine integrity
The PowerShell installer SHALL verify the SHA-256 checksum of both the downloaded executable and `tdk-cli-engine.tar.gz` using entries from `checksums.txt` before installing or extracting them. Missing or malformed entries and checksum mismatches SHALL stop installation with an actionable error.

#### Scenario: Engine checksum mismatch
- **WHEN** the downloaded engine archive does not match its checksum entry
- **THEN** installation stops before extraction and reports the expected and actual checksum values

#### Scenario: Checksums match
- **WHEN** both downloaded files match their checksum entries
- **THEN** the installer proceeds with engine extraction and executable installation

### Requirement: Windows release documentation follows verified evidence
Public documentation SHALL list `tdk-windows-amd64.exe` and its manual installation layout. Documentation SHALL remove pending-asset caveats only after the latest release contains the executable and the Windows release smoke passes. Windows instructions SHALL retain the AMD64-only scope and Docker Desktop Linux-container requirement.

#### Scenario: Release evidence is incomplete
- **WHEN** the latest public release lacks the executable or the Windows smoke has not passed
- **THEN** public documentation retains the pending or caveat language and SHALL NOT claim the release is ready

#### Scenario: Release evidence is complete
- **WHEN** the latest release includes the executable and required assets and the Windows smoke passes
- **THEN** release README and applicable website/framework documentation list the executable, describe the installer/manual layout, and remove the pending-asset caveat
