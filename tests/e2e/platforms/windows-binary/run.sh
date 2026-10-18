#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# The Windows release candidate (moved from the windows-smoke job of .github/workflows/release-binaries.yml, #1300). The release
# workflow downloads the candidate into release-dist/ and sets VERSION; WB1 is the job's one step, with the same logic
# (verify-release-binary.ps1), run against the built binary rather than a source build.
#
#   VERSION=<version> tests/e2e/platforms/windows-binary/run.sh WB1
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init windows-binary windows-binary

# pwsh needs a Windows path on Git Bash; cygpath is only there on Windows runners.
windows_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

WB1() { # the built Windows binary: checksums, version, bundled runtime layout
  log "WB1 release candidate Windows binary"
  [ -n "${VERSION:-}" ] || die "set VERSION to the release candidate's version"
  [ -d "$REPO_ROOT/release-dist" ] || die "download the release candidate into $REPO_ROOT/release-dist first"
  cd "$REPO_ROOT"
  # The script extracts the engine archive with `tar`. On a Windows runner Git Bash's tar can read "D:\..." as a remote host, so
  # resolve tar to the system copy the original pwsh step used.
  PATH="/c/Windows/System32:$PATH" VERSION="$VERSION" pwsh -NoProfile -File "$(windows_path "$SUITE_DIR/verify-release-binary.ps1")"
}

e2e_main "$@"
