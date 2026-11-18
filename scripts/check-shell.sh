#!/usr/bin/env bash
# Bash syntax and Docker template parity checks. No Docker or Tilt.
set -euo pipefail
cd "$(dirname "$0")/.."
shopt -s nullglob

for script in scripts/verify-*.sh tests/e2e/lib/lib.sh tests/e2e/*/*/*.sh tests/e2e/resource-types/common.sh; do
  bash -n "$script" || { echo "check-shell: syntax error in $script" >&2; exit 1; }
done

node scripts/check-docker-templates.mjs
