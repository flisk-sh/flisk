#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# The native Windows CLI on windows-latest (moved from .github/workflows/windows-smoke.yml, #1300). The workflow checks out the
# repository, sets up Node and installs dependencies; each case here is one step of its old job, with the same logic:
#   W1 typecheck the CLI, build it and run its help
#   W2 the Windows platform unit tests
#   W3 native Windows refuses doctor, up --dry-run and up shop with WSL2 guidance and starts nothing (native-refusal.ps1)
#
#   tests/e2e/platforms/windows/run.sh all      every case in order
#   tests/e2e/platforms/windows/run.sh W2 W3    single cases
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init windows windows

# pwsh needs a Windows path on Git Bash; cygpath is only there on Windows runners.
windows_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

W1() { # typecheck the CLI, build it and run its help
  log "W1 typecheck, build and run the CLI help"
  (cd "$REPO_ROOT" && npm run typecheck)
  (cd "$REPO_ROOT/cli" && npm run build)
  (cd "$REPO_ROOT/cli" && node bin/tdk.js --help)
}

W2() { # the Windows platform unit tests
  log "W2 Windows platform unit tests"
  cd "$REPO_ROOT/cli"
  npm test -- --run src/utils/platform.test.ts src/utils/which.test.ts src/utils/windows-doctor.test.ts src/commands/__tests__/up.test.ts
}

W3() { # native Windows refuses the CLI with WSL2 guidance and starts nothing
  log "W3 native Windows CLI contract"
  cd "$REPO_ROOT/cli"
  pwsh -NoProfile -File "$(windows_path "$SUITE_DIR/native-refusal.ps1")"
}

e2e_main "$@"
