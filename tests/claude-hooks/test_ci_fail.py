# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
.claude/hooks/ci-fail.py, the Stop hook that tells Claude when a PR of this repo has failing CI.

Runs the real script against a real temporary git repo with a stub `gh` that plays the PR list, so nothing touches the
network or the user's ~/.claude (HOME points at a temp dir).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

HOOK = Path(__file__).resolve().parents[2] / ".claude" / "hooks" / "ci-fail.py"
URL = "https://github.com/flisk-sh/flisk/pull/{n}"


def git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True,
                   env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
                        "GIT_COMMITTER_EMAIL": "t@t"})


@pytest.fixture
def env(tmp_path: Path):
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    git(repo, "commit", "-q", "--allow-empty", "-m", "init")
    # A second worktree on its own branch: the session's PRs live in worktrees like this one.
    git(repo, "worktree", "add", "-q", "-b", "feature-a", str(tmp_path / "wt-a"))
    home = tmp_path / "home"
    home.mkdir()
    bindir = tmp_path / "bin"
    bindir.mkdir()
    prs = tmp_path / "prs.json"
    prs.write_text("[]")
    gh = bindir / "gh"
    gh.write_text(f"#!/bin/sh\n[ \"$1 $2\" = 'pr list' ] || exit 1\ncat {prs}\n")
    gh.chmod(0o755)

    def run(stdin: dict | None = None):
        proc = subprocess.run(
            [sys.executable, str(HOOK)], input=json.dumps(stdin if stdin is not None else {"cwd": str(repo)}),
            capture_output=True, text=True,
            env={"HOME": str(home), "PATH": f"{bindir}:/usr/bin:/bin"},
        )
        assert proc.returncode == 0, proc.stderr
        return proc.stdout.strip()

    def set_prs(*items: dict):
        prs.write_text(json.dumps(list(items)))

    return run, set_prs, home


def pr(number: int, branch: str, checks: list[dict], sha: str = "abc") -> dict:
    return {"number": number, "url": URL.format(n=number), "headRefName": branch, "headRefOid": sha,
            "statusCheckRollup": checks}


FAIL = {"name": "Test", "conclusion": "FAILURE"}
OK = {"name": "Lint", "conclusion": "SUCCESS"}


def test_a_failing_pr_in_another_worktree_is_reported(env):
    run, set_prs, _ = env
    set_prs(pr(7, "feature-a", [FAIL, OK]))
    out = json.loads(run())
    assert out["decision"] == "block"
    assert "pull/7" in out["reason"] and "Test" in out["reason"] and "Lint" not in out["reason"]


def test_the_same_failure_is_reported_once_and_a_new_commit_again(env):
    run, set_prs, _ = env
    set_prs(pr(7, "feature-a", [FAIL]))
    assert run()
    assert run() == ""
    set_prs(pr(7, "feature-a", [FAIL], sha="def"))
    assert run()


def test_green_and_unrelated_prs_stay_silent(env):
    run, set_prs, _ = env
    set_prs(pr(7, "feature-a", [OK]), pr(8, "someone-elses-branch", [FAIL]))
    assert run() == ""


def test_main_is_never_reported(env):
    run, set_prs, _ = env
    set_prs(pr(9, "main", [FAIL]))
    assert run() == ""


def test_it_does_not_loop_when_already_continuing_from_a_stop_hook(env):
    run, set_prs, _ = env
    set_prs(pr(7, "feature-a", [FAIL]))
    assert run({"stop_hook_active": True}) == ""


def test_every_run_leaves_a_log_line(env):
    run, set_prs, home = env
    set_prs(pr(7, "feature-a", [OK]))
    run()
    assert "checked 1 branches" in (home / ".claude" / "hooks" / "flisk-ci-fail.log").read_text()


def test_a_failing_gh_is_logged_not_silent(env, tmp_path):
    run, set_prs, home = env
    (tmp_path / "bin" / "gh").write_text("#!/bin/sh\necho 'auth required' >&2\nexit 4\n")
    assert run() == ""
    log = (home / ".claude" / "hooks" / "flisk-ci-fail.log").read_text()
    assert "gh pr list failed" in log and "auth required" in log
