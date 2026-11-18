#!/usr/bin/env python3
"""Stop hook: if this session's branch has an open flisk-sh/flisk PR with failing CI, tell Claude to fix it.

Scope: only the PR of the branch checked out in the session's cwd, only repo flisk-sh/flisk.
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
    try:
        out = subprocess.run(
            ["gh", "pr", "view", "--json", "number,state,url,headRefOid,statusCheckRollup"],
            cwd=cwd, capture_output=True, text=True, timeout=20,
        )
        if out.returncode != 0:
            return
        pr = json.loads(out.stdout)
    except Exception:
        return
    if pr.get("state") != "OPEN" or f"github.com/{REPO}/" not in pr.get("url", ""):
        return
    failing = sorted({
        c.get("name") or c.get("context") or "?"
        for c in pr.get("statusCheckRollup") or []
        if (c.get("conclusion") or c.get("state") or "").upper() in BAD
    })
    if not failing:
        return
    key = f"{pr['number']}:{pr['headRefOid']}:{','.join(failing)}"
    try:
        seen = json.load(open(SEEN))
    except Exception:
        seen = []
    if key in seen:
        return
    os.makedirs(os.path.dirname(SEEN), exist_ok=True)
    json.dump((seen + [key])[-200:], open(SEEN, "w"))
    print(json.dumps({
        "decision": "block",
        "reason": (
            f"CI is failing on {pr['url']}: {', '.join(failing)}. "
            "Find the cause (gh run list --branch <branch>; gh run view <id> --log-failed), "
            "fix it, verify, commit with -s and push to the PR branch."
        ),
    }))


main()
