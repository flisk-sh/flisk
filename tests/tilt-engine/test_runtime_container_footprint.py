# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Runtime container footprint: single Bun process, cheap healthchecks, lean golden images.

Executes the real Starlark generators through Tilt's interpreter
(`tilt alpha tiltfile-result`) instead of inspecting source text.
Spec: openspec/changes/optimize-runtime-docker-layers/specs/runtime-container-footprint/spec.md
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [
    pytest.mark.generator,
    pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed"),
]

DOCKER_DIR = Path(__file__).resolve().parents[2] / "runtime" / "engine" / "topologies" / "platform" / "docker"
RESULT_MARKER = "Error in fail: RESULT"


def run_starlark(tmp_path: Path, body: str, env: dict | None = None) -> dict:
    """Run `body` in a Tiltfile; `body` must assign a dict to `r`. `@DOCKER` is the engine docker dir."""
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        f"HERE = '{tmp_path}'\n"
        + body.replace("@DOCKER", str(DOCKER_DIR))
        + "\nfail('RESULT' + encode_json(r))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        env={**os.environ, **(env or {})},
        timeout=180,
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


def write_service(tmp_path: Path, name: str, start_script: str | None) -> None:
    service_dir = tmp_path / name
    service_dir.mkdir()
    scripts = {} if start_script is None else {"start": start_script}
    (service_dir / "package.json").write_text(json.dumps({"name": name, "scripts": scripts}))


def cmd_lines(dockerfile: str) -> list[str]:
    return [line for line in dockerfile.splitlines() if line.startswith("CMD ")]


def healthcheck_lines(dockerfile: str) -> list[str]:
    return [line for line in dockerfile.splitlines() if line.startswith("HEALTHCHECK")]


@pytest.mark.parametrize(
    ("start_script", "expected_cmd"),
    [
        ("bun run dist/index.js", 'CMD ["bun", "dist/index.js"]'),
        ("bun dist/index.js", 'CMD ["bun", "dist/index.js"]'),
        ("bun run dist/index.js --port 4000", 'CMD ["bun", "run", "start"]'),
        ("NODE_ENV=x bun run dist/index.js", 'CMD ["bun", "run", "start"]'),
        ("tsc && bun dist/index.js", 'CMD ["bun", "run", "start"]'),
        ("bun run serve", 'CMD ["bun", "run", "start"]'),
        (None, 'CMD ["bun", "run", "start"]'),
    ],
)
def test_backend_cmd_follows_start_script(tmp_path, start_script, expected_cmd):
    write_service(tmp_path, "svc", start_script)
    r = run_starlark(
        tmp_path,
        "load('@DOCKER/layers/l4_runtime_layers.star', 'L4_generate_backend_runtime')\n"
        "r = {\n"
        "  'plain': L4_generate_backend_runtime(HERE + '/svc'),\n"
        "  'infisical': L4_generate_backend_runtime(HERE + '/svc', use_infisical=True, resource_name='svc'),\n"
        "}\n",
    )
    assert cmd_lines(r["plain"]) == [expected_cmd]
    assert cmd_lines(r["infisical"]) == [expected_cmd]
    assert 'ENTRYPOINT ["/entrypoint.sh"]' in r["infisical"]


def test_explicit_cmd_override_is_kept(tmp_path):
    write_service(tmp_path, "svc", "bun run dist/index.js")
    r = run_starlark(
        tmp_path,
        "load('@DOCKER/layers/l4_runtime_layers.star', 'L4_generate_backend_runtime')\n"
        "r = {'df': L4_generate_backend_runtime(HERE + '/svc', cmd='bun run start:prod')}\n",
    )
    assert cmd_lines(r["df"]) == ['CMD ["bun", "run", "start:prod"]']


def test_hugo_installed_only_for_services_declaring_it(tmp_path):
    write_service(tmp_path, "svc", "bun run dist/index.js")
    r = run_starlark(
        tmp_path,
        "load('@DOCKER/layers/l4_runtime_layers.star', 'L4_generate_backend_runtime')\n"
        "r = {\n"
        "  'with': L4_generate_backend_runtime(HERE + '/svc', manifest={'featuresEnabled': ['hugo']}),\n"
        "  'without': L4_generate_backend_runtime(HERE + '/svc', manifest={'featuresEnabled': []}),\n"
        "}\n",
    )
    assert "apk add --no-cache hugo" in r["with"]
    assert "apk add --no-cache hugo" not in r["without"]


def test_golden_dockerfile_is_lean_and_uses_shared_healthcheck(tmp_path):
    r = run_starlark(
        tmp_path,
        "load('@DOCKER/build/golden_image_dockerfile.star', 'generate_golden_dockerfile')\n"
        "r = {'df': generate_golden_dockerfile()}\n",
    )
    df = r["df"]
    backend_bun_stage = df.split("AS l4_backend_bun", 1)[1].split("\nFROM ", 1)[0]
    migrator_stage = df.split("AS l4_migrator_golden", 1)[1].split("\nFROM ", 1)[0]

    assert "apk add --no-cache hugo" not in backend_bun_stage
    assert "HEALTHCHECK NONE" in migrator_stage

    checks = healthcheck_lines(df)
    assert checks, "golden Dockerfile has no HEALTHCHECK instructions"
    for line in checks:
        assert "bunx" not in line and "npx" not in line, line
        if line != "HEALTHCHECK NONE":
            assert "--interval=30s --start-interval=0.5s" in line, line


def test_compose_entries_use_init_and_shared_healthcheck(tmp_path):
    r = run_starlark(
        tmp_path,
        "load('@DOCKER/compose/compose.star', 'generate_backend_compose_entry', 'generate_frontend_compose')\n"
        "r = {\n"
        "  'backend': generate_backend_compose_entry('services/finance', 'finance', {'name': 'cash-api'},"
        " {'stack': 'finance', 'port': 4018, 'appType': 'backend'}),\n"
        "  'frontend': generate_frontend_compose('services/finance', 'finance', {'name': 'dash-app'},"
        " {'stack': 'finance', 'port': 3010, 'appType': 'frontend'}),\n"
        "}\n",
    )
    for kind in ("backend", "frontend"):
        entry = r[kind]
        assert "init: true" in entry, kind
        assert "interval: 30s" in entry, kind
        assert "start_interval: 0.5s" in entry, kind
        assert "interval: 10s" not in entry, kind


def test_healthcheck_interval_is_configurable(tmp_path):
    r = run_starlark(
        tmp_path,
        "load('@DOCKER/config/healthcheck.star', 'dockerfile_healthcheck_flags', 'compose_healthcheck_timing')\n"
        "r = {'flags': dockerfile_healthcheck_flags(), 'timing': compose_healthcheck_timing()}\n",
        env={"FLISK_HEALTHCHECK_INTERVAL_SECONDS": "15"},
    )
    assert "--interval=15s" in r["flags"]
    assert "interval: 15s" in r["timing"]


def _timing(tmp_path, value):
    env = {} if value is None else {"FLISK_HEALTHCHECK_START_INTERVAL_SECONDS": value}
    return run_starlark(
        tmp_path,
        "load('@DOCKER/config/healthcheck.star', 'dockerfile_healthcheck_flags', 'compose_healthcheck_timing')\n"
        "r = {'flags': dockerfile_healthcheck_flags(), 'timing': compose_healthcheck_timing()}\n",
        env=env,
    )


def test_start_interval_defaults_to_half_a_second(tmp_path):
    r = _timing(tmp_path, None)
    assert "--start-interval=0.5s" in r["flags"]
    assert "start_interval: 0.5s" in r["timing"]


def test_start_interval_override_accepts_decimals_and_integers(tmp_path):
    r = _timing(tmp_path, "0.25")
    assert "--start-interval=0.25s" in r["flags"]
    assert "start_interval: 0.25s" in r["timing"]
    r = _timing(tmp_path, "3")
    assert "--start-interval=3s " in r["flags"]
    assert "start_interval: 3s\n" in r["timing"]
    r = _timing(tmp_path, "1.0")
    assert "--start-interval=1s " in r["flags"]


def test_start_interval_invalid_override_falls_back_to_default(tmp_path):
    for bad in ("0", "-1", "abc", "1e3", "1.2.3", ".", "0.0"):
        r = _timing(tmp_path, bad)
        assert "--start-interval=0.5s" in r["flags"], bad
