#!/usr/bin/env python3
"""Stop hook: if this session's branch has an open flisk-sh/flisk PR with failing CI, tell Claude to fix it.

Scope: the PRs of the branches checked out in this repo's worktrees, only repo flisk-sh/flisk.
Each (PR, commit, failing set) is reported once, so it cannot loop.
"""
import json, os, subprocess, sys

REPO = "flisk-sh/flisk"
SEEN = os.path.expanduser("~/.claude/hooks/.flisk-ci-seen.json")  # shared with the user-level copy, so a failure is reported once
BAD = {"FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ERROR"}


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    if data.get("stop_hook_active"):
        return
    cwd = data.get("cwd") or os.getcwd()
    # A session often opens its PRs from other worktrees, so check the branch of every worktree of this repo.
    branches = []
    try:
        wt = subprocess.run(["git", "worktree", "list", "--porcelain"], cwd=cwd, capture_output=True, text=True, timeout=10)
        branches = [l[len("branch refs/heads/"):] for l in wt.stdout.splitlines() if l.startswith("branch refs/heads/")]
        cur = subprocess.run(["git", "branch", "--show-current"], cwd=cwd, capture_output=True, text=True, timeout=10).stdout.strip()
        if cur and cur not in branches:
            branches.append(cur)
    except Exception:
        return
    try:
        seen = json.load(open(SEEN))
    except Exception:
        seen = []
    reasons = []
    for branch in dict.fromkeys(branches):
        if branch in ("main", "master"):
            continue
        try:
            out = subprocess.run(
                ["gh", "pr", "view", branch, "--json", "number,state,url,headRefOid,statusCheckRollup"],
                cwd=cwd, capture_output=True, text=True, timeout=20,
            )
            if out.returncode != 0:
                continue
            pr = json.loads(out.stdout)
        except Exception:
            continue
        if pr.get("state") != "OPEN" or f"github.com/{REPO}/" not in pr.get("url", ""):
            continue
        failing = sorted({
            c.get("name") or c.get("context") or "?"
            for c in pr.get("statusCheckRollup") or []
            if (c.get("conclusion") or c.get("state") or "").upper() in BAD
        })
        if not failing:
            continue
        key = f"{pr['number']}:{pr['headRefOid']}:{','.join(failing)}"
        if key in seen:
            continue
        seen.append(key)
        reasons.append(f"{pr['url']} (branch {branch}): {', '.join(failing)}")
    if not reasons:
        return
    os.makedirs(os.path.dirname(SEEN), exist_ok=True)
    json.dump(seen[-200:], open(SEEN, "w"))
    print(json.dumps({
        "decision": "block",
        "reason": (
            "CI is failing on: " + "; ".join(reasons) + ". "
            "For each, find the cause (gh run list --branch <branch>; gh run view <id> --log-failed), "
            "fix it in that branch's worktree, verify, commit with -s and push."
        ),
    }))


main()
