## Why

The WSL2 guide and smoke script do not prove that Windows can boot the landscape; the existing quickstart E2E runs only on Ubuntu. A required green WSL2 CI result using the runner path available today, plus a native Windows refusal check, provide evidence for that tested path while keeping the rating formula, other score axes, and the 1.x stability caveat unchanged.

## What Changes

- Tighten the existing `.github/workflows/wsl2-smoke.yml`: run it on pushes to the default branch as well as pull requests, keep its `windows-2022` + Ubuntu 24.04 WSL2 + Docker Engine-inside-WSL2 backend, and require a successful result as a merge gate. This validates that CI runtime path only; Docker Desktop WSL integration remains untested and receives no platform evidence from this job.
- Extend the existing `.github/workflows/windows-smoke.yml` with native Windows AMD64 checks for `flisk --version`, `flisk doctor`, `flisk up --dry-run`, and verify that `flisk up shop` exits non-zero without starting containers and points users to WSL2 Ubuntu.
- Link the successful WSL2 workflow history from `docs/wsl2.md` with a clear note that CI uses Docker Engine inside WSL2 and does not test the guide's Docker Desktop integration path.
- With the current guide still describing Docker Desktop, cap the evidence-based Platforms score at 4 after both required jobs succeed and are linked. A 5 requires either a passing Desktop integration test or changing the supported Windows guide to the Engine-in-WSL2 path CI tests.
- Preserve the current rating formula, Job-fit axes, other score axes, and the 1.x stability caveat.

## Capabilities

### New Capabilities
- `wsl2-landscape-ci`: Required CI evidence for landscape boot using Docker Engine inside Ubuntu WSL2 and native Windows refusal.

### Modified Capabilities
- `windows-wsl-support`: Replace the conditional/report-only WSL CI policy with the required WSL2 landscape gate and documented evidence link.

## Impact

- Existing GitHub Actions workflows: WSL2 default-branch triggers and required status check, plus native Windows refusal checks in `windows-smoke.yml`.
- `scripts/wsl2-smoke.sh` and a qualified `docs/wsl2.md` evidence link.
- Platforms evidence only; the rating formula and all other axes remain unchanged.
