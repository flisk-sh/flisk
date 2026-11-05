#!/usr/bin/env bash
# Bash syntax check (bash -n) for the verification and e2e shell scripts. Runs nothing; no Docker or Tilt.
set -euo pipefail
cd "$(dirname "$0")/.."
shopt -s nullglob

for script in scripts/verify-*.sh tests/e2e/lib/lib.sh tests/e2e/*/*/*.sh tests/e2e/resource-types/common.sh; do
  bash -n "$script" || { echo "check-shell: syntax error in $script" >&2; exit 1; }
done
