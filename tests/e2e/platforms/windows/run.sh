#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The native Windows CLI on windows-latest (moved from the retired windows-smoke workflow, #1300). The workflow checks out the
# repository, sets up Node and installs dependencies; each case here is one step of its old job, with the same logic:
#   W1 typecheck the CLI, build it and run its help
#   W2 the Windows platform unit tests
#   W3 native Windows refuses doctor, up --dry-run and up shop with WSL2 guidance and starts nothing
#   W4 native Windows refuses a Docker starter (flisk restaurant) before it clones, installs or boots anything
#   W5 native Windows runs `flisk demo` without Docker: the two-service demo answers, a rerun reuses it, flisk down stops it
#   W6 a fresh Windows clone installs with lifecycle scripts enabled and the cross-platform npm helpers work
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
  (cd "$REPO_ROOT/cli" && node bin/flisk.js --help)
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

W4() { # native Windows refuses a Docker starter before it clones or installs anything
  log "W4 native Windows demo contract"
  cd "$REPO_ROOT/cli"
  pwsh -NoProfile -File "$(windows_path "$SUITE_DIR/demo-refusal.ps1")"
}

W5() { # native Windows runs the demo without Docker
  log "W5 native Windows demo without Docker"
  cd "$REPO_ROOT/cli"
  pwsh -NoProfile -File "$(windows_path "$SUITE_DIR/demo-native.ps1")"
}

W6() { # npm install with lifecycle scripts in a fresh Windows clone
  log "W6 npm install with lifecycle scripts in a fresh clone"
  local clone="$SUITE_ROOT/npm-install-clone"
  local hooks_path
  rm -rf "$clone"
  git clone --no-local "$REPO_ROOT" "$clone"
  # This repository does not ship .githooks, so give the clone one to exercise the hooksPath branch of `prepare`.
  mkdir -p "$clone/.githooks"
  (
    cd "$clone"
    npm install --ignore-scripts=false --legacy-peer-deps --package-lock=false --no-audit --no-fund
  )
  hooks_path="$(git -C "$clone" config --local --get core.hooksPath)"
  [ "$hooks_path" = ".githooks" ] || die "prepare did not set core.hooksPath in the clone: '$hooks_path'"
  # The clean scripts use the same Node helper on native Windows; run both from npm to cover cmd.exe script execution.
  (
    cd "$clone"
    npm run postpack
    npm --prefix cli run clean
  )
  rm -rf "$clone"
}

e2e_main "$@"
