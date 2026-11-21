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
#   - a TypeScript source under cli/src selects the tests that import it (`vitest related`), and any change to cli/src or cli/dist
#     also runs every test file that starts the built CLI, which `related` cannot see because they run cli/dist as a child process;
#   - files the unit tests build on run the full suite: cli/src/test-support (shared by every test), anything else under cli/
#     (package.json, a vitest or tsconfig, templates, a non-TypeScript file under cli/src), runtime/, examples/, the suites under
#     tests/generated and tests/runtime-layout, and the root package.json and lockfile;
#   - any other file (docs, workflows, scripts, e2e suites, workers, plugins) runs only the test files that name it: its path, its
#     folder or its file name. A workflow or docs change no longer runs the whole suite.
# Selected mode writes related.txt (changed cli/src files) and files.txt (test files to run as they are), both relative to cli/, into <out-dir>.
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
mentions=()
source_changed=""
while IFS= read -r path; do
  [ -n "$path" ] || continue
  case "$path" in
    cli/src/test-support/*) full "$path is shared by every test" ;;
    cli/src/*.ts | cli/src/*.tsx) # in a case pattern `*` also matches `/`, so this covers every depth
      source_changed=1
      [ -f "$path" ] && related+=("${path#cli/}") ;;
    cli/dist/*) source_changed=1 ;;
    cli/* | runtime/* | examples/* | tests/generated/* | tests/runtime-layout/* | package.json | bun.lock)
      full "the unit tests build on $path" ;;
    *)
      mentions+=("$path" "${path##*/}")
      [[ "$path" == */* ]] && mentions+=("${path%/*}") ;;
  esac
done <<<"$changed"

mkdir -p "$out_dir"
printf '%s\n' "${related[@]:-}" | sed '/^$/d' >"$out_dir/related.txt"
test_files() { find cli/src tests/generated tests/runtime-layout \( -name '*.test.ts' -o -name '*.test.tsx' \) -type f 2>/dev/null; }
{
  if [[ -n "$source_changed" ]]; then
    test_files | xargs grep -lE 'runFlisk\(|bin/flisk\.js|cli/dist|dist/cli|spawnSync\(process\.execPath|execFileSync\(process\.execPath' || true
  fi
  if [[ "${#mentions[@]}" -gt 0 ]]; then
    patterns=()
    for m in "${mentions[@]}"; do patterns+=(-e "$m"); done
    test_files | xargs grep -lF "${patterns[@]}" || true
  fi
} | sed -e 's#^cli/##' -e 's#^tests/#../tests/#' | sort -u >"$out_dir/files.txt"

echo "mode=selected" >>"$out"
echo "unit tests: selected ($(wc -l <"$out_dir/related.txt" | tr -d ' ') changed source files, $(wc -l <"$out_dir/files.txt" | tr -d ' ') test files to run as they are)" >&2
