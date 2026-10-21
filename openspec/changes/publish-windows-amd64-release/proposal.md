## Why

The CLI can already produce a Windows AMD64 executable, but compile-time checks do not prove that the public release contains a usable binary or that the installer can place the engine where the executable expects it. Release claims and documentation need to follow evidence from published assets and an actual Windows smoke run.

## What Changes

- Gate release publication on the Windows executable being present, non-empty, PE signed by its `MZ` header, checksummed, packaged in the binary ZIP, and listed on the published GitHub release.
- Run a Windows runner smoke check against the release candidate, verifying checksums, version parity, and packaged engine/template resolution from the adjacent engine layout.
- Verify the engine archive checksum in the PowerShell installer as well as the executable checksum.
- Align release README, installer guidance, website quick start, and framework index with the verified public release state; retain caveats until the Windows smoke and required release evidence pass.

## Capabilities

### New Capabilities
- `windows-release-readiness`: Defines the release asset, Windows smoke, installer integrity, and evidence-gated documentation requirements for a public Windows AMD64 release.

### Modified Capabilities

## Impact

Affects the binary release script and workflow in `flisk`, `install.ps1` in `tdk-landscape.github.io`, and Windows download documentation in `tdk-cli-releases`, `tdk-website`, and `awesome-tdk-framework`. Publishing still targets `tdk-cli-releases`; source remains in `flisk`.
