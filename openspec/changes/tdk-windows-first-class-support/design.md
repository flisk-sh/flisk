## Context

TDK currently targets Linux and macOS, with Unix assumptions in platform detection, PATH lookup, process execution, file operations, doctor diagnostics, and release installation. The requested product is native Windows 10 22H2+, Windows 11, and Windows Server 2022+ on AMD64; WSL2 Ubuntu remains Linux. The CLI binary is `tdk.exe`, with `tdk-cli` beside it. The implementation spans the CLI repository and separate release and website repositories, so this plan is tracked in `tdk-cli-core` while naming those external deliverables explicitly.

## Goals / Non-Goals

**Goals:**
- Make native Windows AMD64 install, upgrade, doctor, process spawning, completion, and project lifecycle flows work with PowerShell and Docker Desktop Linux containers.
- Publish and validate the Windows binary and installer, document the complete setup and known problems, and gate support claims on Windows CI.
- Preserve existing Linux and macOS behavior and require a real Windows 11 AMD64 acceptance run before release readiness.

**Non-Goals:**
- Windows ARM64 binaries, Windows containers, Cygwin, official Git Bash installation, Windows package managers, Authenticode signing, a full-stack Windows CI boot, or changing Unix routing defaults.

## Decisions

- Centralize OS, architecture, asset naming, executable naming, and Windows executable lookup suffixes in `cli/src/utils/platform.ts`. Test mapping through an injectable pure function if mutating Node process globals is unsupported.
- Add `findOnPath` and replace Unix `which`/`command -v` usage across `cli/src`. Use `node:path` for paths and `execFile`/`spawn` with argument arrays, `shell: false`, and `windowsHide: true` for Windows child processes.
- Make upgrade installation detection explicit: compiled `tdk`/`tdk.exe` installs upgrade their executable; npm-installed Node entry points receive the exact npm upgrade instruction and exit successfully; other entry points fail clearly. Use filesystem APIs for rename/removal and Node download facilities rather than shell utilities.
- Keep Windows-specific diagnostics behind platform checks. Reuse the Node port bind probe, add PowerShell/netsh checks for process owners and excluded ranges, check `tdk.localhost` and a sample wildcard host via DNS lookup, and expose numeric loopback URLs alongside routed hostnames on Windows.
- Keep generated containers Linux-based and preserve project-relative mount conventions. Doctor explains Docker Desktop Linux container mode, project-drive file sharing, and Windows port/DNS issues; it does not silently alter port defaults.
- Add Windows PowerShell completion in marked, idempotent profile blocks without changing Bash, Zsh, or Fish behavior.
- Cross-compile `bun-windows-x64` to `tdk-windows-amd64.exe`; include it in checksums and the binary ZIP. Add a PowerShell installer in the website repository that verifies the exe checksum, unpacks the engine beside the executable, supports user-selected install directories, and appends PATH only when needed.
- Add Windows smoke CI for CLI setup, targeted unit tests, and help output, plus a PE signature check for the cross-compiled asset. Do not claim Docker e2e on a runner where Docker is unavailable.
- Update platform support language and Windows setup/troubleshooting docs across named repositories; Windows support claims become valid only after Windows CI and the physical-device acceptance checklist pass.

## Risks / Trade-offs

- [The Windows behavior crosses repositories with different release timing] → Keep the change plan explicit about repository deliverables and publish support claims only once installer, binary, docs, and CI are present.
- [Windows Docker daemon output may vary by Docker Desktop version] → Parse stable daemon OS/architecture fields conservatively and verify the Linux-container case in doctor tests; report actionable uncertainty rather than a false pass.
- [Windows wildcard localhost DNS behavior varies by host configuration] → Test both base and sample names, detect loopback results, show exact hosts-file guidance, and print numeric URLs.
- [Engine tar extraction flags vary across older `tar.exe` versions] → Installer falls back to temporary extraction and moves the top-level contents, then verifies the expected layout.
- [CI cannot prove real Windows Docker/Tilt boot behavior] → Keep the documented Windows 11 AMD64 machine checklist as a release gate.
- [PowerShell profile selection differs between Windows PowerShell and PowerShell 7] → Select the current shell's corresponding profile path, create it when missing, and update only content between unique markers.

## Migration Plan

1. Implement and test platform mapping and PATH resolution, then convert CLI call sites and doctor/upgrade/process behavior in the specified order.
2. Add release binary/checksum packaging, Windows smoke CI, installer, completions, and documentation updates in their respective repositories.
3. Verify Linux and macOS behavior remains intact and Windows CI passes before changing support claims.
4. Run every acceptance item on a Windows 11 AMD64 machine, then publish the release and mark Windows supported.
5. If release validation fails, omit the Windows asset and revert support claims while retaining the proposal artifacts and fix the failing Windows-specific path before retrying.

## Open Questions

- Which exact working directories/repository checkouts are available for the separate `tdk-cli-releases`, `tdk-landscape.github.io`, and TDK website documentation changes when implementation begins?
- Should `tdk doctor --fix-windows-dns` be added in v1, or should v1 provide the required exact elevated hosts-file instructions only? The minimum specified behavior is detection plus instructions, so implementation can ship that without an elevated mutation command.
