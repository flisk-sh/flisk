#!/usr/bin/env bash
# Runs one infrastructure command (a package install, a tarball or image download, a daemon start) and retries it once
# after a failure (#1383). Only wrap infrastructure in it. Never wrap an assertion, a command that checks behaviour, or
# anything after `tdk up` reports success: a failing check must fail on its first attempt.
#
# Usage: scripts/e2e/retry-infra.sh <step label> -- <command> [args...]
#
# Each retry prints a visible warning annotation and appends a line to the job summary, so the number of infrastructure
# retries shows on the run page.
set -uo pipefail

MAX_ATTEMPTS=2
label="${1:?usage: retry-infra.sh <step label> -- <command> [args...]}"
shift
if [ "${1:-}" = "--" ]; then
  shift
fi
if [ "$#" -eq 0 ]; then
  echo "::error::retry-infra.sh: no command given for '$label'"
  exit 2
fi

attempt=1
while true; do
  "$@"
  status=$?
  if [ "$status" -eq 0 ]; then
    exit 0
  fi
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "::error title=E2E infrastructure failure::$label failed on all $MAX_ATTEMPTS attempts (exit $status)"
    exit "$status"
  fi
  attempt=$((attempt + 1))
  echo "::warning title=E2E infrastructure retry::retrying after infrastructure failure: $label (attempt $attempt of $MAX_ATTEMPTS)"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf -- "- Infrastructure retry: \`%s\` (attempt %s of %s)\n" "$label" "$attempt" "$MAX_ATTEMPTS" >> "$GITHUB_STEP_SUMMARY"
  fi
  sleep 5
done
