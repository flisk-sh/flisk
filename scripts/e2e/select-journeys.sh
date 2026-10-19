#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# Chooses the journey suites (tests/e2e/journeys/*/suite.json) that run for this event, and writes the job matrix and the CLI
# version to test to $GITHUB_OUTPUT (#1298). A suite runs when its `triggers` has this event's trigger, and on a pull request
# only when a changed file matches one of its `paths`. A suite that needs secrets runs only when LICENSED is true, and the
# licensed check never runs on a pull request.
#
# Inputs (env): EVENT (github.event_name), SCHEDULE (github.event.schedule), VERSION_INPUT, BASE_SHA (the pull request or merge group base),
# LICENSED ("true" when the licensed secret is configured). Run from the repository root.
set -euo pipefail

event="${EVENT:?EVENT is required}"
case "$event" in
  pull_request | merge_group) trigger="pr" ;;
  schedule)
    case "${SCHEDULE:-}" in
      "0 6 * * *") trigger="nightly" ;;
      "0 7 * * 3") trigger="weekly" ;;
      *) trigger="none" ;;
    esac ;;
  workflow_run) trigger="release" ;;
  push) trigger="main" ;;
  workflow_dispatch) trigger="manual" ;;
  *) trigger="none" ;;
esac

case "$event" in
  workflow_run) version="$(node -p "require('./package.json').version")" ;;
  pull_request | merge_group | push) version=local ;;
  workflow_dispatch) version="${VERSION_INPUT:-local}" ;;
  *) version=latest ;;
esac

changed=""
if [ "$event" = pull_request ] || [ "$event" = merge_group ] || [ "$event" = push ]; then
  changed="$(git diff --name-only "${BASE_SHA:?BASE_SHA is required}" HEAD)"
fi

entries=()
names=()
for file in tests/e2e/journeys/*/suite.json; do
  [ -f "$file" ] || continue
  jq -e --arg t "$trigger" '.triggers | index($t) != null' "$file" >/dev/null || continue
  if [ "$event" = pull_request ] || [ "$event" = merge_group ] || [ "$event" = push ]; then
    hit=no
    while IFS= read -r pattern; do
      glob="${pattern//\*\*/*}" # a `**` glob matches across directories in bash's pattern match
      while IFS= read -r path; do
        # shellcheck disable=SC2053
        if [ -n "$path" ] && [[ "$path" == $glob ]]; then hit=yes; fi
      done <<< "$changed"
    done < <(jq -r '.paths[]' "$file")
    [ "$hit" = yes ] || continue
  fi
  if [ "$(jq -r '.needsSecrets | length' "$file")" != 0 ] && [ "${LICENSED:-}" != true ]; then
    echo "skip $(jq -r .suite "$file"): needs secrets that are not configured"
    continue
  fi
  entries+=("$(jq -c '{suite, check: .checkName, cases: (.cases | join(" ")), timeout: .timeoutMinutes, install: (.install // false), freePostgres: (.freePostgres // false)}' "$file")")
  names+=("$(jq -r .suite "$file")")
done

if [ "${#entries[@]}" -eq 0 ]; then
  matrix='{"include":[]}'
else
  matrix="$(printf '%s\n' "${entries[@]}" | jq -cs '{include: .}')"
fi

echo "trigger=$trigger version=$version suites=${names[*]:-none}"
{
  echo "run=${names[*]:-}"
  echo "version=$version"
  echo "matrix=$matrix"
} >> "${GITHUB_OUTPUT:-/dev/stdout}"
