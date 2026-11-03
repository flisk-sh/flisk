# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
File-backed `secrets.files` and `configs` in a bring-your-own service.json (flisk#3059).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [pytest.mark.generator]
TILT_REQUIRED = pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")

REPO_ROOT = Path(__file__).resolve().parents[2]
ENGINE_ROOT = REPO_ROOT / "runtime" / "engine"
RESULT_MARKER = "Error in fail: RESULT"
FAIL_MARKER = "MANIFEST ERROR"

LOAD = "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')\n"

COMPOSE_BODY = LOAD + """
web = {
    'appType': 'bring-your-own', 'stack': 'wpt', 'port': 3000, 'image': 'webpagetest/server',
    'secrets': {
        'files': [
            {
                'name': 'wpt_settings_ini',
                'source': '../docker/local/wptconfig/settings.ini',
                'target': '/var/www/webpagetest/settings/settings.ini',
                'uid': '1000',
                'gid': '1000',
                'mode': 288,
            },
            {
                'name': 'short_secret',
                'source': './keys/token.txt',
            },
        ],
    },
}
worker = {
    'appType': 'bring-your-own', 'stack': 'wpt', 'port': 3001, 'image': 'webpagetest/server',
    'secrets': {
        'files': [
            {
                'name': 'wpt_settings_ini',
                'source': '../docker/local/wptconfig/settings.ini',
                'target': '/var/www/webpagetest/settings/settings.ini',
            },
        ],
    },
}
gitlab = {
    'appType': 'bring-your-own', 'stack': 'gitlab', 'port': 8080, 'image': 'sameersbn/gitlab',
    'configs': [
        {
            'name': 'gitlab_cfg',
            'source': './gitlab.conf',
            'target': '/etc/gitlab/gitlab.rb',
        },
    ],
}
entries = [
    generate_backend_compose_entry('services/wpt', 'wpt', {'name': 'web'}, web),
    generate_backend_compose_entry('services/wpt', 'wpt', {'name': 'worker'}, worker),
    generate_backend_compose_entry('services/gitlab', 'gitlab', {'name': 'gitlab'}, gitlab),
]
r = {
    'web': entries[0],
    'worker': entries[1],
    'gitlab': entries[2],
    'yaml': generate_app_compose_from_entries('services/wpt', [entries[0], entries[1]]),
    'gitlab_yaml': generate_app_compose_from_entries('services/gitlab', [entries[2]]),
}
"""


def run_tilt(project_root: Path, body: str) -> str:
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "secrets-project"}}))
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(body.replace("@ENGINE", str(ENGINE_ROOT)) + "\nfail('RESULT' + encode_json(r))\n")
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=project_root,
        env={**os.environ, "FLISK_PROJECT_ROOT": str(project_root)},
    )
    return proc.stdout + proc.stderr


@pytest.fixture(scope="module")
def project(tmp_path_factory) -> Path:
    return tmp_path_factory.mktemp("secrets") / "secrets-project"


@pytest.fixture(scope="module")
def result(project) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    output = run_tilt(project, COMPOSE_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_secrets_files_and_configs_emitted_in_service(result):
    assert "    secrets:\n" in result["web"]
    assert "      - source: wpt_settings_ini\n" in result["web"]
    assert "        target: /var/www/webpagetest/settings/settings.ini\n" in result["web"]
    assert '        uid: "1000"\n' in result["web"]
    assert '        gid: "1000"\n' in result["web"]
    assert "        mode: 288\n" in result["web"]
    # Shorthand when default target and no permissions
    assert "      - short_secret\n" in result["web"]

    # Configs in gitlab
    assert "    configs:\n" in result["gitlab"]
    assert "      - source: gitlab_cfg\n" in result["gitlab"]
    assert "        target: /etc/gitlab/gitlab.rb\n" in result["gitlab"]


@TILT_REQUIRED
def test_top_level_secrets_and_configs_declared_once(result):
    top = result["yaml"].split("\nsecrets:\n", 1)[1]
    assert '  wpt_settings_ini:\n    file: "../../../services/wpt/docker/local/wptconfig/settings.ini"\n' in top
    assert '  short_secret:\n    file: "../../../services/wpt/web/keys/token.txt"\n' in top
    # Declared once even though both web and worker mount wpt_settings_ini
    assert top.count("  wpt_settings_ini:\n") == 1

    gitlab_top = result["gitlab_yaml"].split("\nconfigs:\n", 1)[1]
    assert '  gitlab_cfg:\n    file: "../../../services/gitlab/gitlab/gitlab.conf"\n' in gitlab_top


@TILT_REQUIRED
def test_conflicting_secret_sources_fail(project):
    body = LOAD + """
s1 = {'appType': 'bring-your-own', 'stack': 's', 'port': 3000, 'image': 'i', 'secrets': {'files': [{'name': 's', 'source': './a.txt'}]}}
s2 = {'appType': 'bring-your-own', 'stack': 's', 'port': 3001, 'image': 'i', 'secrets': {'files': [{'name': 's', 'source': './b.txt'}]}}
entries = [
    generate_backend_compose_entry('services/s', 's', {'name': 's1'}, s1),
    generate_backend_compose_entry('services/s', 's', {'name': 's2'}, s2),
]
r = {'yaml': generate_app_compose_from_entries('services/s', entries)}
"""
    output = run_tilt(project, body)
    assert FAIL_MARKER in output
    assert "secret 's' is given two sources" in output


@TILT_REQUIRED
def test_path_traversal_source_fails(project):
    body = LOAD + """
bad = {'appType': 'bring-your-own', 'stack': 's', 'port': 3000, 'image': 'i', 'secrets': {'files': [{'name': 's', 'source': '../../../../etc/passwd'}]}}
entries = [generate_backend_compose_entry('services/s', 's', {'name': 'bad'}, bad)]
r = {'yaml': generate_app_compose_from_entries('services/s', entries)}
"""
    output = run_tilt(project, body)
    assert FAIL_MARKER in output
    assert "must stay inside the project" in output
