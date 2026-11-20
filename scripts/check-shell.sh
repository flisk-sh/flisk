#!/usr/bin/env bash
# Bash syntax and Docker template parity checks. No Docker or Tilt.
set -euo pipefail
cd "$(dirname "$0")/.."
shopt -s nullglob

for script in scripts/verify-*.sh tests/e2e/lib/lib.sh tests/e2e/*/*/*.sh tests/e2e/resource-types/common.sh; do
  bash -n "$script" || { echo "check-shell: syntax error in $script" >&2; exit 1; }
done

node scripts/check-docker-templates.mjs

for script in cli/shared-platform-engineering/docker-templates/*.sh runtime/shared-platform-engineering/docker-templates/*.sh; do
  sh -n "$script" || { echo "check-shell: POSIX sh syntax error in $script" >&2; exit 1; }
done

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck -s sh -S warning -e SC3043 \
    cli/shared-platform-engineering/docker-templates/*.sh \
    runtime/shared-platform-engineering/docker-templates/*.sh \
    || { echo "check-shell: shellcheck -s sh failed on docker-templates" >&2; exit 1; }
fi
