# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
The `<svc>-healthy` and `postgres-healthy` gates must not fail a service that is only slow (#3210).

A database on its first start can outlast its start period, so Docker reports it `unhealthy` for a while before it turns
`healthy`. The gate used to exit 1 on the first `unhealthy`; Tilt never reruns it, so `flisk up` reported the service as
failed and its dependents stayed blocked after it had recovered. These tests run the real POSIX scripts against a fake
`docker` (and a no-op `sleep`) that replays a scripted sequence of container states, so they need no Docker daemon.
"""

import ast
import json
import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

RUNTIME = Path(__file__).resolve().parents[2] / "runtime"
TILT = RUNTIME / "engine" / "topologies" / "tilt"
GRACE = 120

FAKE_DOCKER = r'''#!/usr/bin/env python3
"""Replays a container timeline: each `docker ps` call is one poll and moves to the next step."""
import json, os, sys
state_dir = os.environ["FAKE_DOCKER_DIR"]
steps = json.load(open(os.path.join(state_dir, "steps.json")))
counter = os.path.join(state_dir, "polls")
args = sys.argv[1:]
if args and args[0] == "ps":
    if "-a" not in args:  # one poll of the gate's loop starts with `docker ps -q`
        n = int(open(counter).read()) if os.path.exists(counter) else 0
        open(counter, "w").write(str(n + 1))
    print("cid123")
    sys.exit(0)
n = int(open(counter).read()) if os.path.exists(counter) else 1
step = steps[min(n - 1, len(steps) - 1)]
fmt = " ".join(a.split("=", 1)[1] if a.startswith("--format=") else a for a in args)
if "State.Status" in fmt:
    print(step.get("state", "running"))
elif "State.ExitCode" in fmt:
    print(step.get("code", 0))
elif "RestartPolicy" in fmt:
    print(step.get("policy", "no"))
elif "if .State.Health" in fmt:
    health = step.get("health", "none")
    print(health if "Health.Status" in fmt else ("no" if health == "none" else "yes"))
elif "Health.Status" in fmt:
    print(step.get("health", ""))
elif "Health.Log}}{{.ExitCode" in fmt:
    print("1 1 1 ")  # the probe ran and failed: a real failure, not "cannot run"
elif "Health.Log}}{{.Output" in fmt:
    print("connection refused")
elif "FailingStreak" in fmt:
    print(3)
'''


def _starlark_string(path: Path, name: str) -> str:
    """The value of a `NAME = ( '...' + '...' )` string constant; that expression is also valid Python."""
    source = path.read_text()
    match = re.search(rf"^{name} = (\(.*?^\))", source, re.S | re.M)
    assert match, f"{name} not found in {path}"
    return ast.literal_eval(match.group(1).replace("\n    +", "\n    "))


GENERIC = _starlark_string(TILT / "resources" / "orchestrator" / "apply_compose_resource_registration.star", "_HEALTHY_SCRIPT")
POSTGRES = _starlark_string(TILT / "resources" / "infra-loader.star", "_HEALTHY_POSTGRES_SCRIPT")


def _run(tmp_path: Path, script: str, args: list[str], steps: list[dict]):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in (("docker", FAKE_DOCKER), ("sleep", "#!/bin/sh\nexit 0\n")):
        target = bin_dir / name
        target.write_text(body)
        target.chmod(target.stat().st_mode | stat.S_IEXEC)
    (tmp_path / "steps.json").write_text(json.dumps(steps))
    env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "FAKE_DOCKER_DIR": str(tmp_path)}
    out = subprocess.run(["sh", "-c", script, "sh", *args], capture_output=True, text=True, env=env, timeout=120)
    polls = int((tmp_path / "polls").read_text()) if (tmp_path / "polls").exists() else 0
    return out, polls


SCRIPTS = [
    pytest.param(GENERIC, ["db", "120"], "db", id="service-healthy"),
    pytest.param(POSTGRES, ["proj"], "postgres", id="postgres-healthy"),
]


@pytest.mark.parametrize("script,args,label", SCRIPTS)
def test_unhealthy_during_a_slow_first_start_then_healthy_passes(tmp_path, script, args, label):
    steps = [{"health": "starting"}] * 20 + [{"health": "unhealthy"}] * 60 + [{"health": "healthy"}]
    out, _ = _run(tmp_path, script, args, steps)
    assert out.returncode == 0, out.stdout + out.stderr
    assert f"{label} health check is failing; waiting up to {GRACE}s" in out.stdout
    assert f"{label} is healthy" in out.stdout


@pytest.mark.parametrize("script,args,label", SCRIPTS)
def test_unhealthy_late_gets_its_full_window_past_the_poll_limit(tmp_path, script, args, label):
    # turns unhealthy 10 polls before the 120-poll limit and recovers 100 polls later
    steps = [{"health": "starting"}] * 110 + [{"health": "unhealthy"}] * 100 + [{"health": "healthy"}]
    out, polls = _run(tmp_path, script, args, steps)
    assert out.returncode == 0, out.stdout + out.stderr
    assert polls == 211


@pytest.mark.parametrize("script,args,label", SCRIPTS)
def test_still_unhealthy_after_the_window_fails_with_the_reason(tmp_path, script, args, label):
    steps = [{"health": "starting"}] * 5 + [{"health": "unhealthy"}]
    out, polls = _run(tmp_path, script, args, steps)
    assert out.returncode == 1
    assert f"ERROR: {label} is unhealthy: its health check still failed {GRACE}s after it first failed" in out.stdout
    assert polls == 6 + GRACE  # first unhealthy at poll 6, still unhealthy 120 polls later


@pytest.mark.parametrize("script,args,label", SCRIPTS)
def test_recovering_resets_the_window(tmp_path, script, args, label):
    # two separate unhealthy spells, each shorter than the window: neither ends the wait
    steps = [{"health": "unhealthy"}] * 100 + [{"health": "starting"}] + [{"health": "unhealthy"}] * 100 + [{"health": "healthy"}]
    out, _ = _run(tmp_path, script, args, steps)
    assert out.returncode == 0, out.stdout + out.stderr


@pytest.mark.parametrize("script,args,label", SCRIPTS)
def test_exited_container_still_fails_fast(tmp_path, script, args, label):
    steps = [{"health": "unhealthy", "state": "exited", "code": 3}]
    out, polls = _run(tmp_path, script, args, steps)
    assert out.returncode == 1
    assert f"ERROR: container {label} exited with code 3 and will not restart" in out.stdout
    assert polls == 5


@pytest.mark.parametrize("script,args,label", SCRIPTS)
def test_still_starting_times_out_at_the_poll_limit(tmp_path, script, args, label):
    out, polls = _run(tmp_path, script, args, [{"health": "starting"}])
    assert out.returncode == 1
    assert f"ERROR: timed out waiting for {label} to become healthy" in out.stdout
    assert polls == 120


def test_windows_gates_have_the_same_unhealthy_window():
    """The PowerShell gates cannot run here; pin that they follow the same rule as the POSIX ones."""
    ps = (TILT / "common" / "windows_scripts.star").read_text()
    for start, end in (("def healthy_postgres_script", "def provision_database_script"), ("def healthy_script", "def job_done_script")):
        body = ps[ps.index(start):ps.index(end)]
        assert "$grace = 120; $badSince = -1;" in body
        assert "while ($i -lt" in body and "($badSince -ge 0 -and ($i - $badSince) -lt $grace)" in body
        assert "} else { $badSince = -1; }" in body
        assert "its health check still failed ' + $grace + 's after it first failed'); exit 1;" in body
        # an unhealthy container no longer ends the wait on the spot
        assert "is unhealthy'); exit 1;" not in body and "is unhealthy'; exit 1;" not in body
