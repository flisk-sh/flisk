#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Gate G6 of docs/design/native-windows-runtime-decision.md: a Docker + Tilt stack started with `flisk demo` on a real Windows
# machine. The steps (L1 doctor, L2 demo ready, L3 down leaves nothing) live in live-stack.ps1, which the manual workflow
# .github/workflows/e2e-windows-live-stack.yml runs directly on the self-hosted runner. This file exists so the suite is
# described like every other one and `run.sh self-check` is validated; it is never run on a pull request.
#
#   tests/e2e/platforms/windows-live/run.sh all      LIVE, on a Windows machine with Docker Desktop (Linux containers)
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init windows-live windows-live

# pwsh needs a Windows path on Git Bash; cygpath is only there on Windows runners.
windows_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
powershell_exe() { if command -v pwsh >/dev/null 2>&1; then printf 'pwsh'; else printf 'powershell'; fi; }

LIVE() { # doctor, demo ready, down leaves no tilt.exe and no containers
  log "LIVE the demo stack on this Windows host"
  "$(powershell_exe)" -NoProfile -File "$(windows_path "$SUITE_DIR/live-stack.ps1")"
}

e2e_main "$@"
