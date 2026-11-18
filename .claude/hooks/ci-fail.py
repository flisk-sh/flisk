#!/usr/bin/env python3
"""Stop hook: if a branch checked out in this repo's worktrees has an open flisk-sh/flisk PR with failing CI, tell Claude to fix it.

Scope: the PRs of the branches checked out in this repo's worktrees, only repo flisk-sh/flisk.
Each (PR, commit, failing set) is reported once, so it cannot loop.
Test: tests/claude-hooks/test_ci_fail.py
"""
import json, os, subprocess, sys, time

# Hooks can start with a short PATH that lacks Homebrew, where gh usually lives.
os.environ["PATH"] = os.environ.get("PATH", "") + ":/opt/homebrew/bin:/usr/local/bin"

REPO = "flisk-sh/flisk"
HOOKS_DIR = os.path.expanduser("~/.claude/hooks")
SEEN = os.path.join(HOOKS_DIR, ".flisk-ci-seen.json")  # shared by the user-level and project copies: a failure is reported once
LOG = os.path.join(HOOKS_DIR, "flisk-ci-fail.log")
BAD = {"FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ERROR"}


def log(msg):
    """One line per run, so a silent hook can be told apart from a hook that never ran."""
    try:
        os.makedirs(HOOKS_DIR, exist_ok=True)
        with open(LOG, "a") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass


def run(args, cwd, timeout):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    if data.get("stop_hook_active"):
        return
    cwd = data.get("cwd") or os.getcwd()
    # A session often opens its PRs from other worktrees, so look at the branch of every worktree of this repo.
    try:
        wt = run(["git", "worktree", "list", "--porcelain"], cwd, 10)
        branches = [l[len("branch refs/heads/"):] for l in wt.stdout.splitlines() if l.startswith("branch refs/heads/")]
        cur = run(["git", "branch", "--show-current"], cwd, 10).stdout.strip()
        if cur and cur not in branches:
            branches.append(cur)
    except Exception as e:
        log(f"git failed: {e}")
        return
    branches = [b for b in dict.fromkeys(branches) if b not in ("main", "master")]
    if not branches:
        return
    # One call for the user's own open PRs, not one per branch: a repo with many worktrees would exceed the hook timeout.
    try:
        out = run(
            ["gh", "pr", "list", "--repo", REPO, "--state", "open", "--author", "@me", "--limit", "50",
             "--json", "number,url,headRefName,headRefOid,statusCheckRollup"],
            cwd, 25,
        )
        if out.returncode != 0:
            log(f"gh pr list failed: {(out.stderr or '').strip()[:160]}")
            return
        prs = {p["headRefName"]: p for p in json.loads(out.stdout)}
    except Exception as e:
        log(f"gh error: {e}")
        return
    try:
        seen = json.load(open(SEEN))
    except Exception:
        seen = []
    reasons = []
    for branch in branches:
        pr = prs.get(branch)
        if not pr:
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
    log(f"checked {len(branches)} branches, {len(prs)} open PRs; failing: {reasons or 'none'}")
    if not reasons:
        return
    try:
        os.makedirs(HOOKS_DIR, exist_ok=True)
        json.dump(seen[-200:], open(SEEN, "w"))
    except Exception as e:
        log(f"could not save seen file: {e}")
    print(json.dumps({
        "decision": "block",
        "reason": (
            "CI is failing on: " + "; ".join(reasons) + ". "
            "For each, find the cause (gh run list --branch <branch>; gh run view <id> --log-failed), "
            "fix it in that branch's worktree, verify, commit with -s and push."
        ),
    }))


main()
