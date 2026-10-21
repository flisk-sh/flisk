#!/usr/bin/env bash
# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_repo="${TDK_SKILLS_REPO:-$(cd "$repo_root/.." && pwd)/tdk-skills}"

if [[ ! -f "$source_repo/.claude-plugin/marketplace.json" ]]; then
  echo "Missing Flisk skills source repo: $source_repo" >&2
  exit 1
fi

# Skills authored in this repo (not in tdk-skills) are listed in .claude/skills/LOCAL, one name per line; the sync keeps them
# and re-creates their .agents/skills links. Blank lines and # comments are ignored.
local_skills=()
if [[ -f "$repo_root/.claude/skills/LOCAL" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"; line="${line//[[:space:]]/}"
    [[ -n "$line" ]] && local_skills+=("$line")
  done <"$repo_root/.claude/skills/LOCAL"
fi

mkdir -p "$repo_root/.claude-plugin" "$repo_root/.claude/skills" "$repo_root/.agents/skills"
cp "$source_repo/.claude-plugin/marketplace.json" "$repo_root/.claude-plugin/marketplace.json"
rm -rf "$repo_root/.claude-plugin/tdk-cli"
cp -R "$source_repo/plugins/tdk-cli/.claude-plugin" "$repo_root/.claude-plugin/tdk-cli"
for dir in "$repo_root"/.claude/skills/*/; do
  name="$(basename "$dir")"
  [[ " ${local_skills[*]-} " == *" $name "* ]] || rm -rf "$dir"
done
find "$repo_root/.agents/skills" -mindepth 1 -maxdepth 1 -type l -exec rm -f {} +
for skill in "$source_repo"/skills/*; do
  [[ -d "$skill" ]] || continue
  name="$(basename "$skill")"
  mkdir -p "$repo_root/.claude/skills/$name"
  cp "$skill/SKILL.md" "$repo_root/.claude/skills/$name/SKILL.md"
  ln -sfn "../../.claude/skills/$name" "$repo_root/.agents/skills/$name"
done
for name in ${local_skills[@]+"${local_skills[@]}"}; do
  ln -sfn "../../.claude/skills/$name" "$repo_root/.agents/skills/$name"
done
