#!/usr/bin/env bash
# Prints the commit a merge queue run can diff against to select only the e2e legs that still need running, or nothing.
#
# A queued commit is main plus one pull request. When this workflow already passed on that pull request's current head, the
# legs selected by the pull request's own changes were proven there, so the queue only has to rerun the legs that main's newer
# commits touch. `git diff <pr head> HEAD` lists exactly those files: the queued commit differs from the pull request head only
# where main moved since the branch point. Printing nothing means "no reusable run": the caller keeps its full queue selection.
#
# Inputs (env): GITHUB_REF (refs/heads/gh-readonly-queue/<base>/pr-<n>-<sha>), GITHUB_REPOSITORY, WORKFLOW (this workflow's
# file name), GH_TOKEN (needs actions: read and pull-requests: read). Output: a commit SHA on stdout, or nothing.
set -euo pipefail

pr="$(sed -nE 's#^refs/heads/gh-readonly-queue/[^/]+/pr-([0-9]+)-[0-9a-f]+$#\1#p' <<<"${GITHUB_REF:-}")"
[ -n "$pr" ] || exit 0

head="$(gh api "repos/$GITHUB_REPOSITORY/pulls/$pr" --jq .head.sha 2>/dev/null)" || exit 0
[ -n "$head" ] || exit 0

passed="$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/${WORKFLOW:?WORKFLOW is required}/runs?event=pull_request&head_sha=$head&status=success&per_page=1" \
  --jq '.total_count' 2>/dev/null)" || exit 0
[ "${passed:-0}" -gt 0 ] || exit 0

# The pull request head is not an ancestor of a squash queue commit, so fetch it before diffing.
git cat-file -e "$head^{commit}" 2>/dev/null || git fetch --quiet --no-tags origin "$head" 2>/dev/null || exit 0
git cat-file -e "$head^{commit}" 2>/dev/null || exit 0

echo "$head"
