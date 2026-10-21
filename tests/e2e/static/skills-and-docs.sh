#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# Repository checks that need no stack: the skill symlinks, the skill sync script and the documentation links. They were cases
# of the agent suite; they run in make test-shell instead, since they need only the checkout and no Docker or Tilt.
#   tests/e2e/static/skills-and-docs.sh
set -euo pipefail

E2E_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)"
REPO_ROOT="$(cd "$E2E_LIB/../../.." && pwd)"
log() { printf '\n== %s\n' "$*"; }
die() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

D1() {
  log "D1 .claude/skills <-> .agents/skills symlinks"
  cd "$REPO_ROOT"
  local bad=0 d name link
  for d in .claude/skills/*/; do
    name="$(basename "$d")"; link=".agents/skills/$name"
    if [ ! -L "$link" ]; then echo "missing symlink: $link"; bad=1
    elif [ ! -e "$link/SKILL.md" ]; then echo "symlink does not resolve to a skill: $link -> $(readlink "$link")"; bad=1
    else echo "ok  $link -> $(readlink "$link")"; fi
  done
  for link in .agents/skills/*; do
    [ -L "$link" ] || continue
    [ -e "$link" ] || { echo "dangling symlink: $link -> $(readlink "$link")"; bad=1; }
  done
  [ "$bad" -eq 0 ] || die "skill symlinks are inconsistent"
  [ -d .claude/skills/flisk-agent-ops ] || die "flisk-agent-ops skill is missing"
  [ -d .claude/skills/flisk-e2e-author ] || die "flisk-e2e-author skill is missing"
}

D2() {
  log "D2 sync-tdk-skills.sh keeps the skills in .claude/skills/LOCAL and deletes a skill removed upstream"
  local tmp; tmp="$(mktemp -d)"
  mkdir -p "$tmp/repo/scripts" "$tmp/repo/.claude" "$tmp/repo/.agents"
  cp "$REPO_ROOT/scripts/sync-tdk-skills.sh" "$tmp/repo/scripts/"
  cp -R "$REPO_ROOT/.claude/skills" "$tmp/repo/.claude/skills"
  cp -R "$REPO_ROOT/.agents/skills" "$tmp/repo/.agents/skills"
  # A skill the previous sync brought in that the source repo no longer has.
  mkdir -p "$tmp/repo/.claude/skills/removed-upstream"; echo "# gone" >"$tmp/repo/.claude/skills/removed-upstream/SKILL.md"
  ln -sfn ../../.claude/skills/removed-upstream "$tmp/repo/.agents/skills/removed-upstream"
  # Fixture source repo: one kept skill and one new one.
  mkdir -p "$tmp/src/.claude-plugin" "$tmp/src/plugins/tdk-cli/.claude-plugin" "$tmp/src/skills/kept-upstream" "$tmp/src/skills/new-upstream"
  echo '{"name":"fixture","plugins":[]}' >"$tmp/src/.claude-plugin/marketplace.json"
  echo '{"name":"tdk-cli"}' >"$tmp/src/plugins/tdk-cli/.claude-plugin/plugin.json"
  echo "# kept" >"$tmp/src/skills/kept-upstream/SKILL.md"; echo "# new" >"$tmp/src/skills/new-upstream/SKILL.md"
  (cd "$tmp/repo" && TDK_SKILLS_REPO="$tmp/src" bash scripts/sync-tdk-skills.sh) || die "sync-tdk-skills.sh failed on the fixture"
  ls -l "$tmp/repo/.agents/skills"
  local name kept=0
  while IFS= read -r name; do
    name="${name%%#*}"; name="${name//[[:space:]]/}"; [ -n "$name" ] || continue
    [ -f "$tmp/repo/.claude/skills/$name/SKILL.md" ] || die "repo-local skill $name was deleted by the sync"
    [ -e "$tmp/repo/.agents/skills/$name/SKILL.md" ] || die "the .agents/skills/$name link no longer resolves"
    echo "kept repo-local skill: $name"; kept=$((kept + 1))
  done <"$REPO_ROOT/.claude/skills/LOCAL"
  for name in flisk-agent-ops flisk-e2e-author; do
    grep -qx "$name" "$REPO_ROOT/.claude/skills/LOCAL" || die "$name is not listed in .claude/skills/LOCAL"
  done
  [ ! -e "$tmp/repo/.claude/skills/removed-upstream" ] || die "a skill removed upstream survived in .claude/skills"
  [ ! -L "$tmp/repo/.agents/skills/removed-upstream" ] || die "a skill removed upstream survived in .agents/skills"
  for n in kept-upstream new-upstream; do
    [ -f "$tmp/repo/.claude/skills/$n/SKILL.md" ] && [ -e "$tmp/repo/.agents/skills/$n/SKILL.md" ] || die "upstream skill $n was not synced"
  done
  rm -rf "$tmp"
}

D3() {
  log "D3 link, anchor and removed-file check over README.md, docs/** and AGENTS.md"
  (cd "$REPO_ROOT" && node "$E2E_LIB/check-docs.mjs") || die "documentation check failed"
}


for case in D1 D2 D3; do
  "$case"
  echo "PASS $case"
done
