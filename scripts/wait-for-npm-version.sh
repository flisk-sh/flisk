#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Wait for an exact package version to become visible through the public npm
# registry. A successful `npm publish` can precede registry propagation by
# several minutes, while release-triggered E2E workflows start immediately.

set -euo pipefail

package_name="${1:-@flisk-sh/flisk}"
package_version="${2:?Usage: wait-for-npm-version.sh [package] <version> [timeout-seconds]}"
timeout_seconds="${3:-900}"
poll_seconds="${NPM_POLL_SECONDS:-10}"
registry="${NPM_REGISTRY:-https://registry.npmjs.org}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to check registry visibility" >&2
  exit 127
fi
if ! [[ "$timeout_seconds" =~ ^[0-9]+$ ]] || (( timeout_seconds < 1 )); then
  echo "timeout-seconds must be a positive integer" >&2
  exit 2
fi
if ! [[ "$poll_seconds" =~ ^[0-9]+$ ]] || (( poll_seconds < 1 )); then
  echo "NPM_POLL_SECONDS must be a positive integer" >&2
  exit 2
fi

deadline=$((SECONDS + timeout_seconds))
attempt=0
while (( SECONDS < deadline )); do
  attempt=$((attempt + 1))
  published_version="$(npm view "${package_name}@${package_version}" version \
    --prefer-online --registry="$registry" 2>/dev/null || true)"
  if [[ "$published_version" == "$package_version" ]]; then
    echo "${package_name}@${package_version} is visible on ${registry}."
    exit 0
  fi

  if (( attempt == 1 || attempt % 6 == 0 )); then
    echo "Waiting for ${package_name}@${package_version} on ${registry} (attempt ${attempt}; observed '${published_version:-not found}')."
  fi
  sleep "$poll_seconds"
done

echo "::error::${package_name}@${package_version} did not become visible on ${registry} within ${timeout_seconds}s."
exit 1
