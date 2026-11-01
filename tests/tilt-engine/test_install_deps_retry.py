# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
install-deps.sh, the dependency install every app image runs (#2895).

A registry lists a new release before its CDN serves the tarball, so a build minutes after a release failed with
`GET .../rollup-4.67.3.tgz - 404` and took the one-command demo down with it. The script now skips versions published
in the last day, retries registry and network errors with a growing delay, retries without the minimum age when a
dependency pins a newer version, and fails at once on an error retrying cannot fix.

Runs the real script in Alpine (busybox sh, grep and timeout, as in the image) with a stub `bun` that plays a scenario.
The files go in as a tar on stdin, so the test does not depend on Docker file sharing.
"""

from __future__ import annotations

import io
import shutil
import subprocess
import tarfile
from pathlib import Path

import pytest

pytestmark = [pytest.mark.generator]

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "runtime" / "shared-platform-engineering" / "docker-templates" / "install-deps.sh"
CLI_COPY = REPO_ROOT / "cli" / "shared-platform-engineering" / "docker-templates" / "install-deps.sh"
DOCKER_REQUIRED = pytest.mark.skipif(shutil.which("docker") is None, reason="docker CLI not installed")

# The stub answers `bun install --help` (with the flag unless NO_FLAG is set) and plays one line of $SCENARIO per install:
# ok, tgz404, meta404, age, 503 or hang. Every install's arguments go to /w/calls.log.
STUB_BUN = r"""#!/bin/sh
if [ "$2" = "--help" ]; then
  [ -n "$NO_FLAG" ] || echo "      --minimum-release-age=<val>    Only install packages published at least N seconds ago"
  exit 0
fi
echo "$*" >> /w/calls.log
n=$(wc -l < /w/calls.log | tr -d ' ')
step=$(echo "$SCENARIO" | tr ',' '\n' | sed -n "${n}p")
case "$step" in
  ok) mkdir -p node_modules/x && echo "4 packages installed"; exit 0 ;;
  tgz404) echo "error: GET https://registry.npmjs.org/rollup/-/rollup-4.67.3.tgz - 404"; exit 1 ;;
  meta404) echo "error: GET https://registry.npmjs.org/no-such-package-xyz - 404"; exit 1 ;;
  age) echo 'error: No version matching "rollup" found for specifier "4.67.3" (blocked by minimum-release-age: 86400 seconds)'; exit 1 ;;
  503) echo "error: GET https://registry.npmjs.org/vite - 503"; exit 1 ;;
  *) echo "unexpected call $n"; exit 1 ;;
esac
"""


def run_install(scenario: str, **env: str) -> tuple[int, str, list[str]]:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as tar:
        for name, text, mode in (("install-deps.sh", SCRIPT.read_text(), 0o755), ("bun", STUB_BUN, 0o755)):
            data = text.encode()
            info = tarfile.TarInfo(name)
            info.size, info.mode = len(data), mode
            tar.addfile(info, io.BytesIO(data))
    env_args = [arg for key, value in {"SCENARIO": scenario, "FLISK_INSTALL_RETRY_DELAY": "0", **env}.items() for arg in ("-e", f"{key}={value}")]
    proc = subprocess.run(
        ["docker", "run", "--rm", "-i", *env_args, "alpine:3.21", "sh", "-c",
         "mkdir -p /w/app && tar -C /w -xf - && cd /w/app && touch /w/calls.log && "
         "PATH=/w:$PATH sh /w/install-deps.sh; code=$?; echo CALLS; cat /w/calls.log; exit $code"],
        input=buffer.getvalue(), capture_output=True, timeout=180,
    )
    # The script's own output is on stdout; stderr also carries Docker's image pull.
    log, _, calls = proc.stdout.decode().partition("CALLS\n")
    return proc.returncode, log + proc.stderr.decode(), [line for line in calls.splitlines() if line.strip()]


def test_the_cli_ships_the_same_script():
    assert CLI_COPY.read_text() == SCRIPT.read_text()


@DOCKER_REQUIRED
def test_a_tarball_the_registry_does_not_serve_yet_is_retried():
    code, log, calls = run_install("tgz404,ok")
    assert code == 0, log
    assert len(calls) == 2
    assert all("--minimum-release-age=86400" in call for call in calls), calls
    assert "retrying" in log


@DOCKER_REQUIRED
def test_a_package_that_does_not_exist_fails_at_once_without_the_transient_hint():
    code, log, calls = run_install("meta404,ok")
    assert code == 1
    assert len(calls) == 1
    assert "usually transient" not in log


@DOCKER_REQUIRED
def test_a_pinned_version_newer_than_the_minimum_age_installs_without_it():
    code, log, calls = run_install("age,ok")
    assert code == 0, log
    assert "--minimum-release-age" in calls[0]
    assert "--minimum-release-age" not in calls[1]


@DOCKER_REQUIRED
def test_a_registry_that_keeps_failing_gives_up_after_three_attempts_and_says_why():
    code, log, calls = run_install("503,503,503,ok")
    assert code == 1
    assert len(calls) == 3
    assert "usually transient" in log


@DOCKER_REQUIRED
@pytest.mark.parametrize("env", [{"FLISK_MIN_RELEASE_AGE_SECONDS": "0"}, {"NO_FLAG": "1"}])
def test_no_minimum_age_when_turned_off_or_unsupported(env):
    code, log, calls = run_install("ok", **env)
    assert code == 0, log
    assert "--minimum-release-age" not in calls[0]
