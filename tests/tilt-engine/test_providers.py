# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
`providers` in service.json: an external endpoint, the secret that holds its token, and a local fallback.

A hybrid quantum-classical service calls IBM Quantum or Amazon Braket when a token is configured and a local simulator when it
is not. The token must reach the container the way `secrets` do (Compose interpolation from the project .env, never a
generated file), and the service needs to know which of the two to call.

Runs the real generators through Tilt's interpreter (`tilt alpha tiltfile-result`), like test_byo_container_options.py.
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

LOAD = (
    "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry')\n"
    "load('@ENGINE/topologies/platform/docker/secrets/providers.star', 'provider_env_file_lines', 'provider_environment_lines')\n"
)

BODY = LOAD + """
agent = {
    'appType': 'agent', 'stack': 'hqc', 'port': 4001, 'dependsOn': ['quantum-sim'],
    'providers': {
        'ibm-quantum': {'url': 'https://quantum.cloud.ibm.com/api', 'tokenSecret': 'IBM_QUANTUM_TOKEN', 'fallback': 'quantum-sim'},
        'braket': {'url': 'https://braket.us-east-1.amazonaws.com', 'tokenSecret': 'AWS_BRAKET_TOKEN'},
        'docs': {'url': 'https://docs.quantum.ibm.com'},
    },
}
ports = {'quantum-sim': 4502}
r = {
    'entry': generate_backend_compose_entry('services/hqc', 'hqc', {'name': 'research-agent'}, agent),
    'env': provider_env_file_lines(agent, lambda name: ports.get(name)),
    'infisical': provider_environment_lines(agent, 'research-agent', False),
    'plain': generate_backend_compose_entry('services/hqc', 'hqc', {'name': 'api'}, {'appType': 'backend', 'stack': 'hqc', 'port': 4000}),
}
"""


def run_tilt(tmp_path: Path, body: str) -> str:
    project_root = tmp_path / "providers-project"
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "providers-project"}}))
    tiltfile = project_root / "Tiltfile"
    tiltfile.write_text(body.replace("@ENGINE", str(ENGINE_ROOT)) + "\nfail('RESULT' + encode_json(r))\n")
    env = {k: v for k, v in os.environ.items() if k != "FLISK_SECRET_PROVIDER"}
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        cwd=project_root,
        env={**env, "FLISK_PROJECT_ROOT": str(project_root)},
    )
    return proc.stdout + proc.stderr


@pytest.fixture(scope="module")
def result(tmp_path_factory) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    output = run_tilt(tmp_path_factory.mktemp("providers"), BODY)
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_a_provider_with_a_fallback_has_an_optional_token_and_a_remote_flag(result):
    entry = result["entry"]

    assert "      - IBM_QUANTUM_TOKEN=${IBM_QUANTUM_TOKEN:-}\n" in entry
    assert "      - PROVIDER_IBM_QUANTUM_REMOTE=${IBM_QUANTUM_TOKEN:+true}\n" in entry


@TILT_REQUIRED
def test_a_provider_without_a_fallback_refuses_to_start_without_its_token(result):
    entry = result["entry"]

    assert (
        "      - AWS_BRAKET_TOKEN=${AWS_BRAKET_TOKEN:?AWS_BRAKET_TOKEN is required by research-agent (provider braket). "
        "Add it to the project .env}\n"
    ) in entry
    assert "      - PROVIDER_BRAKET_REMOTE=${AWS_BRAKET_TOKEN:+true}\n" in entry
    # A provider with no token gets only its URL.
    assert "PROVIDER_DOCS_REMOTE" not in entry


@TILT_REQUIRED
def test_the_urls_go_to_the_generated_env_file_and_no_token_does(result):
    env = result["env"]

    assert "PROVIDER_BRAKET_URL=https://braket.us-east-1.amazonaws.com\n" in env
    assert "PROVIDER_DOCS_URL=https://docs.quantum.ibm.com\n" in env
    assert "PROVIDER_IBM_QUANTUM_URL=https://quantum.cloud.ibm.com/api\n" in env
    assert "PROVIDER_IBM_QUANTUM_FALLBACK_URL=http://quantum-sim:4502\n" in env
    assert "TOKEN" not in env


@TILT_REQUIRED
def test_infisical_owns_the_token_and_the_flag_still_follows_it(result):
    lines = result["infisical"]

    assert "IBM_QUANTUM_TOKEN=" not in lines
    assert "PROVIDER_IBM_QUANTUM_REMOTE=${IBM_QUANTUM_TOKEN:+true}" in lines


@TILT_REQUIRED
def test_a_service_without_providers_is_generated_as_before(result):
    assert "PROVIDER_" not in result["plain"]


@TILT_REQUIRED
@pytest.mark.parametrize(
    "providers, message",
    [
        ("{'IBM': {'url': 'https://x'}}", "must be named in lowercase"),
        ("{'ibm': {'url': 'ftp://x'}}", "'providers.ibm.url' must be an http(s) URL"),
        ("{'ibm': {'url': 'https://x\\nprivileged: true'}}", "'providers.ibm.url' must be an http(s) URL"),
        ("{'ibm': {'url': 'https://x', 'tokenSecret': 'TOKEN}'}}", "'providers.ibm.tokenSecret' must be"),
        ("{'ibm': {'url': 'https://x', 'required': True}}", "'providers.ibm.required' needs a tokenSecret"),
        ("{'ibm': {'url': 'https://x', 'proxy': True}}", "'providers.ibm.proxy' is not a provider setting"),
    ],
)
def test_a_value_that_could_add_yaml_keys_stops_generation(tmp_path, providers, message):
    body = LOAD + (
        "m = {{'appType': 'backend', 'stack': 'hqc', 'port': 4000, 'providers': {}}}\n"
        "r = generate_backend_compose_entry('services/hqc', 'hqc', {{'name': 'bad'}}, m)\n"
    ).format(providers)
    output = run_tilt(tmp_path, body)

    assert FAIL_MARKER in output and message in output, output[-2000:]
    assert RESULT_MARKER not in output


@TILT_REQUIRED
def test_a_fallback_that_is_not_a_resource_stops_generation(tmp_path):
    body = LOAD + (
        "m = {'appType': 'backend', 'providers': {'ibm': {'url': 'https://x', 'fallback': 'missing-sim'}}}\n"
        "r = provider_env_file_lines(m, lambda name: None)\n"
    )
    output = run_tilt(tmp_path, body)

    assert "'providers.ibm.fallback' names missing-sim, which is not a resource" in output, output[-2000:]
