#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Chooses which unit tests a CI run executes. Writes mode=full or mode=selected to $GITHUB_OUTPUT (stdout without it).
#
# A pull request or merge queue entry only has to run what its change can affect. That is decided conservatively:
#   - only pull_request and merge_group events select; everything else (manual, scheduled and push runs) runs everything, and
#     the scheduled run is the one that keeps measuring coverage and the ratchet;
#   - the entry is read as `git diff HEAD^1 HEAD` (a queue entry's first parent is the queue's base, and a pull request checkout is the merge of its head into the base, so
#     `HEAD^1` is the base there too; the checkout is depth 2);
#   - every changed file must be a TypeScript source under cli/src or committed build output under cli/dist, and none may be
#     under cli/src/test-support (shared by every test). Anything else (docs, runtime/, examples/, package.json, a vitest
#     config, a lockfile) runs the full suite, because tests read those files without importing them;
#   - what runs is the tests that import a changed file (`vitest related`) plus every test file that starts the built CLI,
#     which `related` cannot see because they run cli/dist as a child process.
# Selected mode writes related.txt (changed cli/src files) and spawn.txt (spawning tests), both relative to cli/, into <out-dir>.
set -euo pipefail

out_dir="${1:?usage: select-unit-tests.sh <out-dir>}"
out="${GITHUB_OUTPUT:-/dev/stdout}"
full() { echo "mode=full" >>"$out"; echo "unit tests: full ($1)" >&2; exit 0; }

case "${EVENT:-}" in
  merge_group | pull_request) ;;
  *) full "event ${EVENT:-unset} is not a pull request or a merge queue entry" ;;
esac
git rev-parse --verify --quiet "HEAD^1" >/dev/null || full "no parent commit to diff against"

changed="$(git diff --name-only HEAD^1 HEAD)"
[ -n "$changed" ] || full "no changed files"

related=()
while IFS= read -r path; do
  [ -n "$path" ] || continue
  case "$path" in
    cli/src/test-support/*) full "$path is shared by every test" ;;
    cli/src/*.ts | cli/src/*.tsx) # in a case pattern `*` also matches `/`, so this covers every depth
      [ -f "$path" ] && related+=("${path#cli/}") ;;
    cli/dist/*) ;;
    *) full "$path is outside cli/src and cli/dist" ;;
  esac
done <<<"$changed"

mkdir -p "$out_dir"
printf '%s\n' "${related[@]:-}" | sed '/^$/d' >"$out_dir/related.txt"
grep -rlE 'runFlisk\(|bin/flisk\.js|cli/dist|dist/cli|spawnSync\(process\.execPath|execFileSync\(process\.execPath' \
  cli/src --include='*.test.ts' --include='*.test.tsx' | sed 's#^cli/##' | sort >"$out_dir/spawn.txt" || true

echo "mode=selected" >>"$out"
echo "unit tests: selected ($(wc -l <"$out_dir/related.txt" | tr -d ' ') changed source files, $(wc -l <"$out_dir/spawn.txt" | tr -d ' ') CLI-spawning test files)" >&2
