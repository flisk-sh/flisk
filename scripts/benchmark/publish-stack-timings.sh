#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Publishes stack-timings.json (scripts/benchmark/collect-stack-timings.mjs) to stack-timings/latest.json on the benchmarks-data
# branch, where flisk.sh/benchmarks reads it through raw.githubusercontent.com. Uses the contents API, so the checkout keeps no
# credentials. The branch is created empty on the first run. Needs GH_TOKEN with contents: write and GITHUB_REPOSITORY.
#
#   GH_TOKEN=... GITHUB_REPOSITORY=flisk-sh/flisk scripts/benchmark/publish-stack-timings.sh stack-timings.json
set -euo pipefail

file="${1:?usage: publish-stack-timings.sh <stack-timings.json>}"
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}"
branch="${BENCHMARKS_BRANCH:-benchmarks-data}"
target="stack-timings/latest.json"
[ -s "$file" ] || { echo "::error::$file is missing or empty"; exit 1; }
jq -e '.schema == 1 and (.stacks | length > 0)' "$file" >/dev/null || { echo "::error::$file is not a stack-timings file"; exit 1; }

if ! gh api "repos/$repo/branches/$branch" >/dev/null 2>&1; then
  echo "creating the empty $branch branch"
  tree="$(echo '{"tree":[]}' | gh api "repos/$repo/git/trees" --input - --jq .sha)"
  commit="$(jq -n --arg tree "$tree" '{message: "Start the benchmarks-data branch", tree: $tree, parents: []}' | gh api "repos/$repo/git/commits" --input - --jq .sha)"
  gh api "repos/$repo/git/refs" -f "ref=refs/heads/$branch" -f "sha=$commit" >/dev/null
fi

sha="$(gh api "repos/$repo/contents/$target?ref=$branch" --jq .sha 2>/dev/null || true)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
base64 <"$file" | tr -d '\n' >"$work/content.b64"
# The body goes through a file: the file is too large for one command-line argument.
jq -n --arg message "stack timings $(jq -r '.commit[0:7]' "$file") ($(jq -r '.trigger' "$file"))" --arg branch "$branch" --arg sha "$sha" --rawfile content "$work/content.b64" \
  '{message: $message, branch: $branch, content: $content} + (if $sha == "" then {} else {sha: $sha} end)' >"$work/body.json"
gh api -X PUT "repos/$repo/contents/$target" --input "$work/body.json" --jq '.commit.html_url'
echo "published $target to $repo@$branch"
