#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Post or update the single conflict-button comment for PR_NUMBER.
# Reads PR_URL, HEAD_OWNER, HEAD_BRANCH, BASE_BRANCH from the environment.
# HEAD_OWNER may be empty when the head fork was deleted; the script skips.
set -euo pipefail

: "${PR_NUMBER:?}"
: "${PR_URL:?}"
: "${HEAD_BRANCH:?}"
: "${BASE_BRANCH:?}"
: "${GITHUB_REPOSITORY:?}"

if [[ -z "${HEAD_OWNER:-}" ]]; then
  echo "PR #${PR_NUMBER} has no head owner; skipping."
  exit 0
fi

MARKER="<!-- ai-conflict-buttons -->"
workdir="${RUNNER_TEMP:-/tmp}"
body_file="${workdir}/pr-${PR_NUMBER}-body.md"
out_file="${workdir}/pr-${PR_NUMBER}-comment.md"
patch_file="${workdir}/pr-${PR_NUMBER}-comment.json"

mergeable_state=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  mergeable_state="$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" --jq '.mergeable_state // "unknown"')"
  if [[ "$mergeable_state" != "unknown" && "$mergeable_state" != "null" && -n "$mergeable_state" ]]; then
    break
  fi
  sleep 5
done

if [[ "$mergeable_state" == "unknown" || "$mergeable_state" == "null" || -z "$mergeable_state" ]]; then
  echo "PR #${PR_NUMBER} mergeable_state is still ${mergeable_state:-empty}; not treating it as resolved."
  exit 1
fi

gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" --jq '.body // ""' > "$body_file"

if [[ "$mergeable_state" == "dirty" ]]; then
  export CONFLICTING=true
else
  export CONFLICTING=false
fi
export PR_BODY_FILE="$body_file"
export OUT_FILE="$out_file"
node scripts/ai-conflict-buttons.mjs

comment_id="$(gh api "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" --paginate \
  --jq ".[] | select(.body | contains(\"${MARKER}\")) | .id" | head -n 1)"

if [[ -z "$comment_id" ]]; then
  if [[ "$CONFLICTING" != "true" ]]; then
    echo "PR #${PR_NUMBER} is not conflicting and has no conflict comment."
    exit 0
  fi
  jq -n --rawfile body "$out_file" '{body: $body}' > "$patch_file"
  jq -e 'has("body") and (.body | type == "string")' "$patch_file" > /dev/null
  gh api --method POST "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" \
    --input - < "$patch_file" > /dev/null
  echo "Posted conflict comment on PR #${PR_NUMBER}."
  exit 0
fi

jq -n --rawfile body "$out_file" '{body: $body}' > "$patch_file"
jq -e 'has("body") and (.body | type == "string")' "$patch_file" > /dev/null
gh api --method PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${comment_id}" \
  --input - < "$patch_file" > /dev/null
echo "Updated conflict comment ${comment_id} on PR #${PR_NUMBER} (${mergeable_state})."
