#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_repo="${TDK_SKILLS_REPO:-$(cd "$repo_root/.." && pwd)/tdk-skills}"

if [[ ! -f "$source_repo/.claude-plugin/marketplace.json" ]]; then
  echo "Missing TDK skills source repo: $source_repo" >&2
  exit 1
fi

# Skills authored in this repo (not in tdk-skills); the sync must not delete them.
local_skills=(tdk-agent-ops)

mkdir -p "$repo_root/.claude-plugin" "$repo_root/.claude/skills" "$repo_root/.agents/skills"
cp "$source_repo/.claude-plugin/marketplace.json" "$repo_root/.claude-plugin/marketplace.json"
rm -rf "$repo_root/.claude-plugin/tdk-cli"
cp -R "$source_repo/plugins/tdk-cli/.claude-plugin" "$repo_root/.claude-plugin/tdk-cli"
for dir in "$repo_root"/.claude/skills/*/; do
  name="$(basename "$dir")"
  [[ " ${local_skills[*]} " == *" $name "* ]] || rm -rf "$dir"
done
find "$repo_root/.agents/skills" -mindepth 1 -maxdepth 1 -type l -exec rm -f {} +
for skill in "$source_repo"/skills/*; do
  [[ -d "$skill" ]] || continue
  name="$(basename "$skill")"
  mkdir -p "$repo_root/.claude/skills/$name"
  cp "$skill/SKILL.md" "$repo_root/.claude/skills/$name/SKILL.md"
  ln -sfn "../../.claude/skills/$name" "$repo_root/.agents/skills/$name"
done
for name in "${local_skills[@]}"; do
  ln -sfn "../../.claude/skills/$name" "$repo_root/.agents/skills/$name"
done
