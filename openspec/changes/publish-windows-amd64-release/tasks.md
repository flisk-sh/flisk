## 1. Release asset contract and workflow gates

- [x] 1.1 Validate required local and remote release assets, including PE `MZ`, complete checksums, ZIP membership, and byte-for-byte uploaded asset verification before latest promotion.
- [x] 1.2 Add `flisk runtime --check-assets --json` to verify the bundled engine and templates without machine-readiness checks; cover the executable's adjacent `tdk-cli` layout.
- [x] 1.3 Split release build, Windows smoke, and publication into dependent jobs that pass the exact same workflow artifact; ensure failed gates prevent npm publication and latest promotion, and preserve release concurrency/version-bump behavior.

## 2. Installer integrity

- [ ] 2.1 Update `flisk-sh/flisk-sh.github.io`'s `install.ps1` to parse and verify the engine archive checksum before extraction, with clear failures for missing entries and mismatches.
- [ ] 2.2 Confirm executable and engine verification both happen before installation mutates the target directory.

## 3. Public documentation

- [ ] 3.1 Update `flisk-sh/releases/README.md` with the Windows EXE in the asset list, five-binary ZIP wording, and manual installation layout.
- [ ] 3.2 Update the installer site and `flisk-sh/website` quick start to describe the Windows installer accurately while retaining caveats until release evidence is complete.
- [ ] 3.3 Add the Windows AMD64 asset reference to `awesome-tdk-framework` without modifying example repositories.
- [ ] 3.4 After verified publication, remove pending-asset caveats and record the Windows 11 manual acceptance result; otherwise leave the caveats in place.

## 4. Release verification

- [ ] 4.1 Run release workflow asset checks and Windows smoke against a candidate, confirming checksum, version, runtime asset resolution, ZIP membership, and release asset listing.
- [ ] 4.2 Verify the latest-download URL returns successfully and the PowerShell installer works on a clean Windows 11 AMD64 environment.
- [ ] 4.3 Complete and record the manual Windows 11 AMD64 checklist and confirm public docs make no claim beyond the evidence.
