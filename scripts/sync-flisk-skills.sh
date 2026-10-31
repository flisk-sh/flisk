#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_repo="${FLISK_SKILLS_REPO:-$(cd "$repo_root/.." && pwd)/flisk-skills}"

if [[ ! -f "$source_repo/.claude-plugin/marketplace.json" ]]; then
  echo "Missing Flisk skills source repo: $source_repo" >&2
  exit 1
fi

# Skills authored in this repo (not in flisk-skills) are listed in .claude/skills/LOCAL, one name per line; the sync keeps them
# and re-creates their .agents/skills links. Blank lines and # comments are ignored.
local_skills=()
if [[ -f "$repo_root/.claude/skills/LOCAL" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"; line="${line//[[:space:]]/}"
    [[ -n "$line" ]] && local_skills+=("$line")
  done <"$repo_root/.claude/skills/LOCAL"
fi

# Only the skills come across. This repo's .claude-plugin/marketplace.json lists its own plugin (plugins/flisk, written
# by scripts/agent-plugin.mjs); the flisk-cli plugin stays a flisk-skills marketplace entry.
mkdir -p "$repo_root/.claude/skills" "$repo_root/.agents/skills"
for dir in "$repo_root"/.claude/skills/*/; do
  [[ -d "$dir" ]] || continue
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
