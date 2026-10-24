#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Copy bring-your-own templates from their own repositories into examples/byo/<folder>/ (#1965). Each entry in
# examples/byo/templates.json names a repository and a pinned release tag; this is the only way those folders are
# filled, locally and in CI. The folders are git-ignored, so `--check` fails if one of them is tracked again.
#
# Usage:
#   scripts/sync-byo-templates.sh                   sync every template
#   scripts/sync-byo-templates.sh vue next-app      sync the named template ids
#   scripts/sync-byo-templates.sh --folder create-vue   sync the template that fills this folder
#   scripts/sync-byo-templates.sh --check           fail if a synced folder has tracked files
#
# A failed clone, a missing tag or an id mismatch exits non-zero and leaves the previous folder untouched. It needs only
# git, node and the network; it never escalates privileges.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
registry="$root/examples/byo/templates.json"
[ -f "$registry" ] || { echo "no template registry: $registry" >&2; exit 2; }

# One tab-separated row per template: id, folder, repository, tag.
rows() { node -e 'for (const t of require(process.argv[1]).templates) console.log([t.id, t.folder, t.repository, t.tag].join("\t"))' "$registry"; }

if [ "${1:-}" = "--check" ]; then
  bad=0
  while IFS=$'\t' read -r _id folder repo _tag; do
    if [ -n "$(git -C "$root" ls-files -- "examples/byo/$folder")" ]; then
      echo "examples/byo/$folder is tracked, but it comes from $repo: run 'git rm -r --cached examples/byo/$folder'" >&2
      bad=1
    fi
  done < <(rows)
  exit "$bad"
fi

wanted=()
by_folder=""
while [ $# -gt 0 ]; do
  case "$1" in
    --folder) by_folder="${2:?--folder needs a folder name}"; shift 2 ;;
    -h|--help) sed -n '5,12p' "$0"; exit 0 ;;
    *) wanted+=("$1"); shift ;;
  esac
done

selected() { # <id> <folder>
  [ -n "$by_folder" ] && { [ "$2" = "$by_folder" ]; return; }
  [ ${#wanted[@]} -eq 0 ] && return 0
  local w; for w in "${wanted[@]}"; do [ "$w" = "$1" ] && return 0; done
  return 1
}

matched=0
failed=0
while IFS=$'\t' read -r id folder repo tag; do
  selected "$id" "$folder" || continue
  matched=$((matched + 1))
  dest="$root/examples/byo/$folder"
  stage="$root/examples/byo/.sync-$folder-$$"
  rm -rf "$stage"
  # Give up on a dead connection after 30 seconds instead of hanging.
  if ! git -c http.lowSpeedLimit=1 -c http.lowSpeedTime=30 clone -q --depth 1 --branch "$tag" \
      "https://github.com/$repo.git" "$stage" 2>"$stage.err"; then
    echo "FAIL $id: could not clone $repo at $tag: $(tr '\n' ' ' < "$stage.err")" >&2
    echo "  to fetch it by hand: git clone --depth 1 --branch $tag https://github.com/$repo.git $dest" >&2
    rm -rf "$stage" "$stage.err"; failed=1; continue
  fi
  rm -f "$stage.err"
  got="$(node -e 'try { console.log(require(process.argv[1]).template.id) } catch { console.log("") }' "$stage/service.json")"
  if [ "$got" != "$id" ]; then
    echo "FAIL $id: $repo at $tag has service.json template.id '${got:-<missing>}', expected '$id'" >&2
    rm -rf "$stage"; failed=1; continue
  fi
  sha="$(git -C "$stage" rev-parse HEAD)"
  rm -rf "$stage/.git"
  printf 'repository: %s\ntag: %s\ncommit: %s\n' "$repo" "$tag" "$sha" > "$stage/.synced-from"
  rm -rf "$dest"
  mv "$stage" "$dest"
  echo "synced $id: $repo $tag ($sha) -> examples/byo/$folder"
done < <(rows)

if [ "$matched" -eq 0 ]; then
  echo "no template matches: ${by_folder:-${wanted[*]:-}}" >&2
  exit 2
fi
exit "$failed"
