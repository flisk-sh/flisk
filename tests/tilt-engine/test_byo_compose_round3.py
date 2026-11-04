# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
More Compose settings that imported stacks use (open-mercato, any-sync-dockercompose, wger-project/docker, labsai/EDDI):

- `dependsOn` entries as `{"name": "db", "condition": "service_healthy"}` next to plain names;
- `buildArgs` -> Compose build.args;
- `logging` -> Compose logging (#2965);
- `env` values with nested and mixed Compose expressions (`${A:-${B:-file}}`, `mongodb://${U:-x}:${P}@db/eddi?a=b&c=d`);
- a bind mount whose source is `${VAR:-./path}`, and `"selinux": "z" | "Z"`;
- an image with `${NAME:?message}`.

Runs the real generator and manifest loaders through Tilt's interpreter (`tilt alpha tiltfile-result`), and checks with
`docker compose config` (when Docker is installed) that Compose resolves every value.
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

LOAD = (
    "load('@ENGINE/topologies/platform/docker/compose/compose.star', 'generate_backend_compose_entry', 'generate_app_compose_from_entries')\n"
    "load('@ENGINE/topologies/tilt/manifest/parser.star', 'generated_string_error', 'normalize_depends_on')\n"
    "load('@ENGINE/topologies/tilt/manifest/loader.star', 'ManifestLoader')\n"
    "load('@ENGINE/topologies/tilt/common/dependencies.star', 'declared_dependencies')\n"
)

GARAGE_IMAGE = "dxflrs/garage:${GARAGE_VERSION:?GARAGE_VERSION is not set, see .env.example}"

COMPOSE_BODY = LOAD + """
web = {
    'appType': 'bring-your-own', 'stack': 'shop', 'port': 3000, 'dockerfile': 'Dockerfile',
    'buildArgs': {'NODE_VERSION': '${NODE_VERSION:-22}', 'APP_ENV': 'production', 'NOTE': 'a: b # not a comment'},
    'logging': {'driver': 'json-file', 'options': {'max-size': '5m', 'max-file': '5'}},
    'env': {
        'CONFIG': '${A:-${B:-file}}',
        'MONGO_URL': 'mongodb://${U:-x}:${P}@db/eddi?a=b&c=d',
    },
    'volumes': [
        {'source': '${OM_MCP_SHARED_DIR:-./.mercato/mcp-shared}', 'target': '/shared'},
        {'source': '${OM_CACHE-../../../cache}', 'target': '/cache', 'readOnly': True, 'selinux': 'z'},
        {'source': './data', 'target': '/data', 'selinux': 'Z'},
    ],
    'dependsOn': ['cache', {'name': 'db', 'condition': 'service_healthy'}, {'name': 'migrate', 'condition': 'service_completed_successfully'}],
}
garage = {'appType': 'bring-your-own', 'stack': 'shop', 'port': 3900, 'image': '""" + GARAGE_IMAGE + """', 'exposeViaProxy': False}
plain = {'appType': 'bring-your-own', 'stack': 'shop', 'port': 9000, 'image': 'nginx:alpine'}
backend = {'appType': 'backend', 'stack': 'shop', 'port': 4000, 'buildArgs': {'A': 'b'}, 'logging': {'driver': 'local'}}
raw = {'dependsOn': ['cache', {'name': 'db', 'condition': 'service_healthy'}]}
entries = [
    generate_backend_compose_entry('services/shop', 'shop', {'name': 'web'}, web),
    generate_backend_compose_entry('services/shop', 'shop', {'name': 'garage'}, garage),
]
loaded = ManifestLoader.load_from_file('services/shop/api/service.json')
r = {
    'web': entries[0],
    'garage': entries[1],
    'plain': generate_backend_compose_entry('services/shop', 'shop', {'name': 'plain'}, plain),
    'backend': generate_backend_compose_entry('services/shop', 'shop', {'name': 'api'}, backend),
    'yaml': generate_app_compose_from_entries('services/shop', entries),
    'garage_check': generated_string_error(garage),
    'raw_names': declared_dependencies(raw),
    'normalized': normalize_depends_on({'dependsOn': ['cache', {'name': 'db', 'condition': 'service_healthy'}, {'name': 'job'}]}),
    'strings': normalize_depends_on({'dependsOn': ['a', 'b']}),
    'loaded': {'dependsOn': loaded.manifest['dependsOn'], 'conditions': loaded.manifest['dependsOnConditions']},
    'bad_images': [generated_string_error({'image': v}) for v in [
        'a:${B:?x"y}', 'a:${B:?x\\\\y}', 'a:${B:?x{y}', 'a:${B:?x$y}', 'a:${B:?x\\ny}', 'a:${B:?x`y}', 'a:${B:?x\\u00e9y}',
    ]],
}
"""


def write_project(project_root: Path) -> None:
    (project_root / ".flisk").mkdir(parents=True, exist_ok=True)
    (project_root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": "round3-project"}}))
    api = project_root / "services" / "shop" / "api"
    api.mkdir(parents=True, exist_ok=True)
    (api / "service.json").write_text(
        json.dumps(
            {
                "appName": "api",
                "appType": "bring-your-own",
                "stack": "shop",
                "port": 4000,
                "image": "nginx:alpine",
                "dependsOn": ["cache", {"name": "db", "condition": "service_healthy"}],
            }
        )
    )


def run_tilt(project_root: Path, body: str) -> str:
    write_project(project_root)
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
    return tmp_path_factory.mktemp("round3") / "round3-project"


@pytest.fixture(scope="module")
def result(project) -> dict:
    if shutil.which("tilt") is None:
        pytest.skip("tilt CLI not installed")
    output = run_tilt(project, COMPOSE_BODY)
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


@TILT_REQUIRED
def test_depends_on_objects_become_names_and_keep_their_conditions(result):
    assert result["normalized"]["dependsOn"] == ["cache", "db", "job"]
    assert result["normalized"]["dependsOnConditions"] == {"db": "service_healthy"}
    # Plain names are left as they are.
    assert result["strings"] == {"dependsOn": ["a", "b"]}
    # Every service.json load goes through the same normalisation.
    assert result["loaded"] == {"dependsOn": ["cache", "db"], "conditions": {"db": "service_healthy"}}
    # A manifest that skipped it still reads by name (Tilt resource_deps).
    assert result["raw_names"] == ["cache", "db"]


@TILT_REQUIRED
def test_build_args_are_written_under_build(result):
    entry = result["web"]

    assert (
        "    build:\n"
        "      context: ../../../services/shop/web\n"
        "      dockerfile: Dockerfile\n"
        "      args:\n"
        '        APP_ENV: "production"\n'
        '        NODE_VERSION: "${NODE_VERSION:-22}"\n'
        '        NOTE: "a: b # not a comment"\n'
    ) in entry


@TILT_REQUIRED
def test_logging(result):
    assert '    logging:\n      driver: json-file\n      options:\n        max-file: "5"\n        max-size: "5m"\n' in result["web"]


@TILT_REQUIRED
def test_nested_and_mixed_env_values_are_written_quoted(result):
    entry = result["web"]

    assert '      - "CONFIG=${A:-${B:-file}}"\n' in entry
    # Written as a JSON string, so & is \\u0026, which YAML reads back as &.
    assert '      - "MONGO_URL=mongodb://${U:-x}:${P}@db/eddi?a=b\\u0026c=d"\n' in entry


@TILT_REQUIRED
def test_a_bind_source_from_the_environment_and_selinux(result):
    entry = result["web"]

    # The default is resolved like any other bind path; the variable is left for Compose.
    assert '      - "${OM_MCP_SHARED_DIR:-../../../services/shop/web/.mercato/mcp-shared}:/shared"\n' in entry
    assert '      - "${OM_CACHE-../../../cache}:/cache:ro,z"\n' in entry
    assert "      - ../../../services/shop/web/data:/data:Z\n" in entry


@TILT_REQUIRED
def test_an_image_with_a_required_variable(result):
    assert result["garage_check"] is None
    assert '    image: "' + GARAGE_IMAGE + '"\n' in result["garage"]
    assert all(error and "'image'" in error for error in result["bad_images"]), result["bad_images"]


@TILT_REQUIRED
def test_services_without_these_keys_are_generated_as_before(result):
    for name in ("plain", "backend"):
        assert "logging:" not in result[name]
        assert "args:" not in result[name]


def compose_config(compose_file: Path, extra_env: dict, *args: str) -> subprocess.CompletedProcess:
    names = ("NODE_VERSION", "OM_MCP_SHARED_DIR", "OM_CACHE", "A", "B", "U", "P", "GARAGE_VERSION")
    env = {k: v for k, v in os.environ.items() if k not in names}
    return subprocess.run(
        ["docker", "compose", "-p", "round3project", "-f", str(compose_file), "config", *args],
        capture_output=True,
        text=True,
        timeout=60,
        env={**env, "JWT_SECRET": "x", "DB_PASSWORD": "x", **extra_env},
    )


@pytest.fixture(scope="module")
def compose_file(result, project) -> Path:
    stack = project / "services" / "shop"
    (stack / ".autogenerated").mkdir(parents=True, exist_ok=True)
    for name in ("web", "garage"):
        (stack / name / ".autogenerated").mkdir(parents=True, exist_ok=True)
        (stack / name / ".autogenerated" / ".env.backend.autogenerated").write_text("")
    path = stack / ".autogenerated" / "docker-compose.app.autogenerated.yml"
    path.write_text(result["yaml"])
    return path


@TILT_REQUIRED
@DOCKER_REQUIRED
def test_compose_resolves_every_value(compose_file, project):
    proc = compose_config(compose_file, {"GARAGE_VERSION": "v1.0.1", "B": "from-b", "U": "eddi", "P": "s3cret", "OM_CACHE": "/srv/cache"}, "--format", "json")
    assert proc.returncode == 0, proc.stderr[-2000:]
    services = json.loads(proc.stdout)["services"]
    web, garage = services["web"], services["garage"]

    assert web["build"]["args"] == {"APP_ENV": "production", "NODE_VERSION": "22", "NOTE": "a: b # not a comment"}
    assert web["logging"] == {"driver": "json-file", "options": {"max-file": "5", "max-size": "5m"}}
    assert web["environment"]["CONFIG"] == "from-b"
    assert web["environment"]["MONGO_URL"] == "mongodb://eddi:s3cret@db/eddi?a=b&c=d"
    volumes = {v["target"]: v for v in web["volumes"]}
    assert volumes["/shared"]["source"] == str(project / "services" / "shop" / "web" / ".mercato" / "mcp-shared")
    assert volumes["/cache"]["source"] == "/srv/cache"
    assert volumes["/cache"]["read_only"] is True
    assert volumes["/cache"]["bind"]["selinux"] == "z"
    assert volumes["/data"]["bind"]["selinux"] == "Z"
    assert garage["image"] == "dxflrs/garage:v1.0.1"


@TILT_REQUIRED
@DOCKER_REQUIRED
def test_compose_stops_with_the_message_when_a_required_image_variable_is_unset(compose_file):
    proc = compose_config(compose_file, {}, "--format", "json")

    assert proc.returncode != 0
    assert "GARAGE_VERSION is not set, see .env.example" in proc.stderr


def fails(tmp_path: Path, manifest_extra: str, message: str) -> None:
    body = LOAD + (
        "m = {'appType': 'bring-your-own', 'stack': 'shop', 'port': 9000, 'dockerfile': 'Dockerfile', " + manifest_extra + "}\n"
        "r = generate_backend_compose_entry('services/shop', 'shop', {'name': 'bad'}, normalize_depends_on(m))\n"
    )
    output = run_tilt(tmp_path / "round3-project", body)

    assert FAIL_MARKER in output and message in output, output[-2000:]
    assert RESULT_MARKER not in output


@TILT_REQUIRED
@pytest.mark.parametrize(
    "extra, message",
    [
        ("'dependsOn': [{'name': 'db', 'condition': 'service_ready'}]", "'dependsOn[0].condition' must be one of"),
        ("'dependsOn': [{'name': 'db', 'restart': True}]", "'dependsOn[0].restart' is not a dependsOn option"),
        ("'dependsOn': [{'condition': 'service_healthy'}]", "'dependsOn[0].name' must be a service or stack name"),
        ("'buildArgs': ['A=b']", "'buildArgs' must be an object"),
        ("'buildArgs': {'1A': 'b'}", "'buildArgs' names must be letters"),
        ("'buildArgs': {'A\\nprivileged: true': 'b'}", "'buildArgs' names must be letters"),
        ("'buildArgs': {'A': 'b\\nprivileged: true'}", "'buildArgs.A' must be a string without line breaks"),
        ("'buildArgs': {'A': 1}", "'buildArgs.A' must be a string"),
        ("'logging': 'json-file'", "'logging' must be an object"),
        ("'logging': {'driver': 'json-file', 'labels': 'x'}", "'logging.labels' is not a logging option"),
        ("'logging': {'driver': 'json file'}", "'logging.driver' must be a driver name"),
        ("'logging': {'driver': 'json-file\\n    privileged: true'}", "'logging.driver' must be a driver name"),
        ("'logging': {'options': {'max-size\\n  x': '5m'}}", "'logging.options' keys must be"),
        ("'logging': {'options': {'max-size': '5m\\nprivileged: true'}}", "'logging.options.max-size' must be a string without line breaks"),
        ("'logging': {'options': {'max-file': 5}}", "'logging.options.max-file' must be a string"),
        ("'volumes': [{'source': '${A:-/etc}', 'target': '/x'}]", "'volumes[0].source' variables must be"),
        ("'volumes': [{'source': '${A:-data}', 'target': '/x'}]", "'volumes[0].source' variables must be"),
        ("'volumes': [{'source': '${A}/../etc', 'target': '/x'}]", "'volumes[0].source' variables must be"),
        ("'volumes': [{'source': '${A}x', 'target': '/x'}]", "'volumes[0].source' variables must be"),
        ("'volumes': [{'source': '${A}/x\\nprivileged: true', 'target': '/x'}]", "'volumes[0].source' variables must be"),
        ("'volumes': [{'source': '${1A:-./x}', 'target': '/x'}]", "'volumes[0].source' variables must be"),
        ("'volumes': [{'source': '${A:-./x', 'target': '/x'}]", "'volumes[0].source' variables must be"),
        ("'volumes': [{'source': '${A:-../../../../etc}', 'target': '/x'}]", "'volumes[0].source' must stay inside the project"),
        ("'volumes': [{'source': '${A:-./x\\n  privileged: true}', 'target': '/x'}]", "'volumes[0].source' must be a path"),
        ("'volumes': [{'source': './x', 'target': '/x', 'selinux': 'Zz'}]", "'volumes[0].selinux' must be z (shared) or Z (private)"),
        ("'volumes': [{'source': 'data', 'target': '/x', 'selinux': 'Z'}]", "'volumes[0].selinux' only applies to a bind mount"),
    ],
)
def test_a_value_that_could_add_yaml_keys_stops_generation(tmp_path, extra, message):
    fails(tmp_path, extra, message)
