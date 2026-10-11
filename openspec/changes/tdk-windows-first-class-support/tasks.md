## 1. Platform foundation

- [x] 1.1 Add `cli/src/utils/platform.ts` with the specified OS, architecture, asset, executable, and PATH lookup mappings; add unit cases for Linux x64, macOS arm64, Windows x64, Windows arm64, and unsupported OS.
- [x] 1.2 Update `cli/src/commands/upgrade.ts` to use the shared asset naming helper and remove its local asset mapping.
- [x] 1.3 Add `cli/src/utils/which.ts` (or `findOnPath.ts`) using `node:path`, PATH delimiter, and Windows executable suffix lookup; add unit coverage.
- [x] 1.4 Search `cli/src` for `which` and `command -v`, replacing every Unix-only executable lookup with `findOnPath`.

## 2. Upgrade and process compatibility

- [x] 2.1 Update upgrade installation detection for compiled Windows binaries, npm installs, and unsupported entry points with the specified user messages.
- [x] 2.2 Replace Windows-incompatible `file`, `chmod`, shell `mv`/`rm`, and shell tar extraction in upgrade with Node filesystem APIs and argument-safe extraction; preserve Unix behavior.
- [x] 2.3 Ensure upgrade downloads use Node fetch/https on all platforms when the current path shells out to curl; test Windows asset dry-run and npm behavior.
- [x] 2.4 Update `cli/src/utils/tilt.ts`, `cli/src/utils/exec-async.ts`, and other specified child-process call sites to use resolved executables, argument arrays, `shell: false`, and `windowsHide: true` on Windows.
- [x] 2.5 Search `cli/src` for Unix-only host commands and shell command strings, replacing required `which`, `file`, `chmod`, `lsof`, `curl`, and `tar` usage with portable APIs or Windows-specific implementations.

## 3. Windows doctor and network behavior

- [x] 3.1 Update `cli/src/commands/doctor.ts`, `cli/src/utils/doctor-runtime.ts`, and `cli/src/utils/doctor-wiring.ts` to find Docker, Tilt, Bun, and npm-only Node using `findOnPath` and retain existing version gates.
- [x] 3.2 Add Windows Docker daemon-running and Linux-container-mode checks with the exact specified next-step messages.
- [x] 3.3 Keep the Node port bind test; add PowerShell listener ownership and netsh excluded-range diagnostics, including IIS naming and Hyper-V/WSL guidance.
- [x] 3.4 Add Windows DNS checks for `tdk.localhost` and a sample host, exact hosts-file guidance, project-drive file-sharing guidance, and a non-mutating `core.autocrlf` warning.
- [x] 3.5 Update Windows `tdk networks` output to include hostname and numeric loopback URLs while preserving Unix routing defaults.
- [x] 3.6 Review generated Compose/Tilt/templates for Windows-host assumptions; retain Linux containers and project-relative mounts, avoid host-side chmod, and preserve existing port overrides.

## 4. PowerShell completion

- [x] 4.1 Extend `cli/src/commands/completion.ts` with `--shell powershell` installation into the correct current-shell profile path.
- [x] 4.2 Make completion installation create missing profiles and idempotently replace only the marked TDK block; preserve Bash, Zsh, and Fish behavior.

## 5. Windows binary and CI

- [x] 5.1 Update `scripts/release-binaries.sh` to compile Bun `bun-windows-x64` as `tdk-windows-amd64.exe`, include it in checksums and the binary ZIP, and preserve Unix names and engine archive.
- [x] 5.2 Update `.github/workflows/release-binaries.yml` to assert the executable exists at the script's real output location.
- [x] 5.3 Add `.github/workflows/windows-smoke.yml` using `windows-latest`, Node 22, the repository's dependency installation convention, CLI build/typecheck, actual CLI `--help`, and targeted platform/upgrade/PATH tests without fake Docker e2e.
- [x] 5.4 Add a Linux-side compile validation that checks the Windows artifact is non-empty and begins with `MZ`.

## 6. Installer and documentation across repositories

- [ ] 6.1 In `tdk-landscape.github.io`, add `install.ps1` with architecture refusal, latest-release downloads, exe checksum verification, per-user/default install path, adjacent engine extraction with old-tar fallback, user PATH update, and success instructions.
- [ ] 6.2 Update release README and download list with `tdk-windows-amd64.exe — Windows x86_64 / AMD64`, Windows manual installation commands, and installer instructions.
- [ ] 6.3 Update `tdk-cli-core/README.md`, applicable `cli/README.md`, TDK website quickstart, website homepage/install page, and org profile README to use the exact supported-platform wording and Windows setup steps.
- [ ] 6.4 Add a Windows problems documentation page covering only Docker Desktop state/mode, ports and Hyper-V exclusions, `*.localhost` DNS, and project-drive file sharing.
- [ ] 6.5 Replace every specified “Windows is untested” statement and check templates for host-side `/tmp`, `/usr/local`, or shell-script assumptions without changing container-side scripts.

## 7. Verification and release gate

- [ ] 7.1 Run targeted CLI unit tests for platform mapping, upgrade asset naming, and PATH lookup on Windows CI; run relevant existing Unix tests/build checks for regressions.
- [ ] 7.2 Verify the PowerShell installer, documentation, Windows binary, checksums, ZIP, and smoke workflow are present and agree on names and paths.
- [ ] 7.3 Complete the provided acceptance checklist on a real Windows 11 AMD64 machine: install, version, doctor, project scaffold, up/Tilt UI, networks/browser health URL, down, upgrade dry-run, npm installation, and Ubuntu/macOS regression confirmation.
- [ ] 7.4 Claim Windows support only after Windows CI and all real-device acceptance items pass; record any failure and keep support claims gated until fixed.
