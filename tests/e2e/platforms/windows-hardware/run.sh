#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The published Windows binary on a real Windows host (#1765). The Windows CI suites (tests/e2e/platforms/windows and
# tests/e2e/platforms/windows-binary) prove the contract on a GitHub-hosted runner. This suite proves it on the machine a
# developer uses: the published tdk-windows-amd64.exe, installed the way a user installs it, with the paths, PATH lookup and
# filesystem a runner never has.
#
#   tests/e2e/platforms/windows-hardware/run.sh all      every case in order
#   tests/e2e/platforms/windows-hardware/run.sh WH4     one case
#
# The cases live in windows-hardware.ps1, so a machine without Git Bash can still run them:
#   pwsh -NoProfile -File tests/e2e/platforms/windows-hardware/windows-hardware.ps1 -Case all
#
# Inputs (environment variables):
#   FLISK_WINDOWS_RELEASE   the release to test: "latest" (default) or "v1.3.204"
#   FLISK_WINDOWS_EXE       test this exe instead of the published one (a local build)
#   FLISK_WINDOWS_WORK_DIR  scratch directory (default: $SUITE_ROOT/work)
#   FLISK_HARDWARE_REPORT   where the findings report goes (default: $ARTIFACTS/windows-hardware-findings.md)
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init windows-hardware windows-hardware

# pwsh needs a Windows path on Git Bash; cygpath is only there on Windows runners.
windows_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

# Windows 11 ships Windows PowerShell 5.1, not pwsh. The script runs under both; the installer case prefers pwsh.
powershell_exe() { if command -v pwsh >/dev/null 2>&1; then printf 'pwsh'; else printf 'powershell'; fi; }

WORK_DIR="${FLISK_WINDOWS_WORK_DIR:-$SUITE_ROOT/work}"
REPORT="${FLISK_HARDWARE_REPORT:-$ARTIFACTS/windows-hardware-findings.md}"
mkdir -p "$WORK_DIR" "$ARTIFACTS"

run_case() { # <case id>
  local id="$1"
  log "$id the published Windows binary on this host"
  FLISK_WINDOWS_WORK_DIR="$(windows_path "$WORK_DIR")" \
    FLISK_HARDWARE_REPORT="$(windows_path "$REPORT")" \
    FLISK_WINDOWS_RELEASE="${FLISK_WINDOWS_RELEASE:-latest}" \
    FLISK_WINDOWS_EXE="${FLISK_WINDOWS_EXE:-}" \
    "$(powershell_exe)" -NoProfile -File "$(windows_path "$SUITE_DIR/windows-hardware.ps1")" -Case "$id"
}

WH1() { # the published exe and engine archive match checksums.txt
  run_case WH1
}

WH2() { # the official installer unpacks the engine, updates PATH and runs the exe
  run_case WH2
}

WH3() { # the exe reports the release version and finds its own engine
  run_case WH3
}

WH4() { # native Windows refuses doctor and up with WSL2 guidance and starts nothing
  run_case WH4
}

WH5() { # the exe starts from a path with a space, resolves through PATH and refuses in a spaced project
  run_case WH5
}

WH6() { # the one-command demo flow does not boot a stack on native Windows
  run_case WH6
}

e2e_main "$@"
