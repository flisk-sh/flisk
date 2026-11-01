# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
`models` in a bring-your-own service.json (Compose models, served by Docker Model Runner).

A Compose stack such as nosia declares `models: {llm: {model: ai/smollm2}}` at the top and lists `models: [llm]` on the service
that uses it. flisk-import@0.10.0 and flisk-export@0.4.0 write `"models": [{"name": "llm", "model": "ai/smollm2"}]`; without this
key the generated Compose file dropped the model. `model` can also be a Compose variable (`${LLM_MODEL:-ai/smollm2}`).

Runs the real Compose generator through Tilt's interpreter (`tilt alpha tiltfile-result`), like test_byo_env.py, and checks with
`docker compose config` (when Docker is installed) that Compose reads the models as written and resolves the variable's default.
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
DOCKER_REQUIRED = pytest.mark.skipif(shutil.which("docker") is None, reason="docker CLI not installed")

REPO_ROOT = Path(__file__).resolve().parents[2]
ENGINE_ROOT = REPO_ROOT / "runtime" / "engine"
RESULT_MARKER = "Error in fail: RESULT"
FAIL_MARKER = "MANIFEST ERROR"

LOAD = "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')\n"

COMPOSE_BODY = LOAD + """
web = {
    'appType': 'bring-your-own', 'stack': 'nosia', 'port': 3000, 'image': 'ghcr.io/nosia-ai/nosia:latest',
    'models': [{'name': 'llm', 'model': '${LLM_MODEL:-ai/smollm2}'}, {'name': 'embedding', 'model': 'ai/granite-embedding-multilingual'}],
}
worker = {
    'appType': 'bring-your-own', 'stack': 'nosia', 'port': 3001, 'image': 'ghcr.io/nosia-ai/nosia:latest',
    'models': [{'name': 'llm', 'model': '${LLM_MODEL:-ai/smollm2}'}, {'name': 'qwen', 'model': 'ai/qwen3:8B-Q4_K_M'}, {'name': 'hf', 'model': 'hf.co/org/name'}],
}
plain = {'appType': 'bring-your-own', 'stack': 'nosia', 'port': 9000, 'image': 'nginx:alpine'}
backend = {'appType': 'backend', 'stack': 'nosia', 'port': 4000, 'models': [{'name': 'llm', 'model': 'ai/smollm2'}]}
entries = [
    generate_backend_compose_entry('services/nosia', 'nosia', {'name': 'web'}, web),
    generate_backend_compose_entry('services/nosia', 'nosia', {'name': 'worker'}, worker),
]
r = {
    'web': entries[0],
    'worker': entries[1],
    'plain': generate_backend_compose_entry('services/nosia', 'nosia', {'name': 'plain'}, plain),
    'backend': generate_backend_compose_entry('services/nosia', 'nosia', {'name': 'api'}, backend),
    'yaml': generate_app_compose_from_entries('services/nosia', entries),
    'plain_yaml': generate_app_compose_from_entries('services/nosia', [generate_backend_compose_entry('services/nosia', 'nosia', {'name': 'plain'}, plain)]),
}
"""


def run_tilt(project_root: Path, body: str) -> str:
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "models-project"}}))
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
    return tmp_path_factory.mktemp("models") / "models-project"


@pytest.fixture(scope="module")
def result(project) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    output = run_tilt(project, COMPOSE_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_each_service_lists_its_models(result):
    assert "    models:\n      - llm\n      - embedding\n" in result["web"]
    assert "    models:\n      - llm\n      - qwen\n      - hf\n" in result["worker"]


@TILT_REQUIRED
def test_models_are_declared_once_at_the_top_level_and_quoted(result):
    top = result["yaml"].split("\nmodels:\n", 1)[1]

    assert '  llm:\n    model: "${LLM_MODEL:-ai/smollm2}"\n' in top
    assert '  embedding:\n    model: "ai/granite-embedding-multilingual"\n' in top
    assert '  qwen:\n    model: "ai/qwen3:8B-Q4_K_M"\n' in top
    assert '  hf:\n    model: "hf.co/org/name"\n' in top
    # Two services naming the same model share one declaration.
    assert top.count("\n  llm:\n") + top.startswith("  llm:\n") == 1


@TILT_REQUIRED
def test_services_without_models_are_generated_as_before(result):
    assert "models:" not in result["plain"]
    assert "models:" not in result["plain_yaml"]
    # Only bring-your-own resources read `models`; the CLI reports it on other types.
    assert "models:" not in result["backend"]


@TILT_REQUIRED
@DOCKER_REQUIRED
@pytest.mark.parametrize("llm_model, expected", [(None, "ai/smollm2"), ("ai/llama3.2", "ai/llama3.2")])
def test_compose_reads_the_models_and_resolves_the_variable(result, project, llm_model, expected):
    stack = project / "services" / "nosia"
    (stack / ".autogenerated").mkdir(parents=True, exist_ok=True)
    for name in ("web", "worker"):
        (stack / name / ".autogenerated").mkdir(parents=True, exist_ok=True)
        (stack / name / ".autogenerated" / ".env.backend.autogenerated").write_text("")
    compose_file = stack / ".autogenerated" / "docker-compose.app.autogenerated.yml"
    compose_file.write_text(result["yaml"])
    env = {k: v for k, v in os.environ.items() if k != "LLM_MODEL"}
    if llm_model:
        env["LLM_MODEL"] = llm_model
    env = {**env, "JWT_SECRET": "x", "DB_PASSWORD": "x"}

    def compose(*args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["docker", "compose", "-p", "modelsproject", "-f", str(compose_file), "config", *args],
            capture_output=True,
            text=True,
            timeout=60,
            env=env,
        )

    proc = compose("--format", "json")
    assert proc.returncode == 0, proc.stderr[-2000:]
    services = json.loads(proc.stdout)["services"]
    assert set(services["web"]["models"]) == {"llm", "embedding"}
    assert set(services["worker"]["models"]) == {"llm", "qwen", "hf"}

    # `config --format json` leaves the top-level models out (Compose 5.1); `config --models` prints each one, resolved.
    listed = compose("--models")
    if listed.returncode != 0 and "unknown flag" in listed.stderr:
        pytest.skip("this docker compose has no `config --models`")
    assert listed.returncode == 0, listed.stderr[-2000:]
    assert sorted(listed.stdout.split()) == sorted([expected, "ai/granite-embedding-multilingual", "ai/qwen3:8B-Q4_K_M", "hf.co/org/name"])


def fails(tmp_path: Path, body: str, message: str) -> None:
    output = run_tilt(tmp_path / "models-project", body)

    assert FAIL_MARKER in output and message in output, output[-2000:]
    assert RESULT_MARKER not in output


def bad_body(models: str) -> str:
    return LOAD + (
        "m = {'appType': 'bring-your-own', 'stack': 'nosia', 'port': 9000, 'image': 'nginx:alpine', 'models': " + models + "}\n"
        "r = generate_backend_compose_entry('services/nosia', 'nosia', {'name': 'bad'}, m)\n"
    )


@TILT_REQUIRED
@pytest.mark.parametrize(
    "models, message",
    [
        ("{'name': 'llm', 'model': 'ai/smollm2'}", "'models' must be a list"),
        ("['llm']", "'models[0]' must be an object"),
        ("[{'name': 'llm', 'model': 'ai/smollm2', 'x': 1}]", "'models[0].x' is not a model option"),
        ("[{'model': 'ai/smollm2'}]", "'models[0].name' must be a model name"),
        ("[{'name': '-llm', 'model': 'ai/smollm2'}]", "'models[0].name' must be a model name"),
        ("[{'name': 'llm\\n  evil:', 'model': 'ai/smollm2'}]", "'models[0].name' must be a model name"),
        ("[{'name': 'llm', 'model': 'ai/a'}, {'name': 'llm', 'model': 'ai/b'}]", "'models[1].name' llm is listed twice"),
        ("[{'name': 'llm'}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': ''}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': 'ai/smollm2\\n    privileged: true'}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': 'ai/smollm2\" privileged: true'}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': 'ai/smollm2\\\\'}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': 'ai/smollm2 x'}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': ': x'}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': '${LLM_MODEL'}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': '${LLM_MODEL:-}'}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': '${1BAD}'}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': '${LLM_MODEL:-ai/x\"}'}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': '${A}${B}'}]", "'models[0].model' must be a model"),
        ("[{'name': 'llm', 'model': 7}]", "'models[0].model' must be a model"),
    ],
)
def test_a_model_that_could_add_yaml_keys_stops_generation(tmp_path, models, message):
    fails(tmp_path, bad_body(models), message)


@TILT_REQUIRED
def test_one_name_for_two_models_stops_generation(tmp_path):
    body = COMPOSE_BODY.replace("{'name': 'llm', 'model': '${LLM_MODEL:-ai/smollm2}'}, {'name': 'qwen'", "{'name': 'llm', 'model': 'ai/other'}, {'name': 'qwen'")
    assert body != COMPOSE_BODY
    fails(tmp_path, body, "model 'llm' is given two models")
