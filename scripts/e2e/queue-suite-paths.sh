#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Says whether a merge queue entry changes anything a suite reads, so a gate that runs only in the queue can skip an entry that
# touches none of the suite's `paths` (tests/e2e/**/suite.json). Writes relevant=true or relevant=false to $GITHUB_OUTPUT.
#
# A queued commit is main plus one pull request, so `git diff <base> HEAD` lists exactly what that pull request changed. When the
# base cannot be read the answer is true: a gate that cannot tell runs, it never skips by accident. A suite.json with no paths
# always runs. The glob rule is the one select-journeys.sh uses (`**` matches across directories in bash's pattern match).
#
# Usage: BASE_SHA=<queue base> scripts/e2e/queue-suite-paths.sh <suite.json> [<suite.json>...]; relevant if any suite matches.
set -euo pipefail

out="${GITHUB_OUTPUT:-/dev/stdout}"
say() { echo "relevant=$1" >>"$out"; echo "queue paths: relevant=$1 ($2)" >&2; }

[ "$#" -gt 0 ] || { echo "usage: $0 <suite.json>..." >&2; exit 2; }

base="${BASE_SHA:-}"
if [ -z "$base" ]; then say true "no base commit"; exit 0; fi
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  git fetch --quiet --no-tags --depth=1 origin "$base" 2>/dev/null || true
fi
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then say true "base $base not readable"; exit 0; fi

changed="$(git diff --name-only "$base" HEAD)"
if [ -z "$changed" ]; then say false "no changed files"; exit 0; fi

for file in "$@"; do
  patterns=()
  while IFS= read -r line || [ -n "$line" ]; do
    if [ -n "$line" ]; then patterns+=("$line"); fi
  done < <(jq -r '.paths[]?' "$file")
  if [ "${#patterns[@]}" -eq 0 ]; then say true "$file declares no paths"; exit 0; fi
  for pattern in "${patterns[@]}"; do
    glob="${pattern//\*\*/*}"
    while IFS= read -r path; do
      # shellcheck disable=SC2053
      if [ -n "$path" ] && [[ "$path" == $glob ]]; then say true "$path matches $pattern in $file"; exit 0; fi
    done <<<"$changed"
  done
done
say false "no changed file matches the suite paths"
