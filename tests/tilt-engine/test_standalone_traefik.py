# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Standalone Flisk projects must serve api.{project}.localhost via Traefik."""

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = [pytest.mark.fast, pytest.mark.generator]

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_DIR = REPO_ROOT / "runtime" / "engine" / "topologies" / "platform" / "docker" / "compose"
NETWORKING_DIR = REPO_ROOT / "runtime" / "engine" / "topologies" / "platform" / "docker" / "networking"
RESULT_MARKER = "Error in fail: RESULT"


def _run_starlark(tmp_path: Path, body: str) -> dict:
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        body.replace("@COMPOSE", str(COMPOSE_DIR)).replace("@NETWORKING", str(NETWORKING_DIR))
        + "\nfail('RESULT' + encode_json(r))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


def _compose_section(yaml_text: str, start: str, end: str) -> str:
    start_index = yaml_text.index(start)
    end_index = yaml_text.index(end, start_index + len(start))
    return yaml_text[start_index:end_index]


def test_standalone_traefik_compose_generator_exists():
    source = (
        REPO_ROOT
        / "runtime" / "engine"
        / "topologies"
        / "platform"
        / "docker"
        / "compose"
        / "traefik_standalone.star"
    ).read_text()
    assert "generate_standalone_traefik_compose" in source
    assert "entrypoints.web.address=:80" in source


def test_infra_loader_falls_back_to_standalone_traefik():
    source = (
        REPO_ROOT
        / "runtime" / "engine"
        / "topologies"
        / "tilt"
        / "resources"
        / "infra-loader.star"
    ).read_text()
    assert "_load_standalone_traefik" in source
    assert "using standalone Traefik" in source


def test_project_router_uses_cli_api_path():
    source = (
        REPO_ROOT
        / "runtime" / "engine"
        / "topologies"
        / "platform"
        / "docker"
        / "networking"
        / "traefik_helpers.star"
    ).read_text()
    assert "def cli_api_path(" in source
    assert "flisk up" in source


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_build_entrypoints_http_only(tmp_path):
    """build_entrypoints with HTTP only produces 'web' entrypoint and excludes HTTPS."""
    r = _run_starlark(
        tmp_path,
        """
load('@NETWORKING/traefik_helpers.star', 'build_entrypoints')
r = {'entrypoints': build_entrypoints(True, False)}
""",
    )
    entrypoints = r["entrypoints"]
    assert entrypoints == "web"
    entrypoints_list = entrypoints.split(",")
    assert "web" in entrypoints_list
    assert "websecure" not in entrypoints_list


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_build_entrypoints_http_and_https(tmp_path):
    """build_entrypoints with HTTP and HTTPS enabled produces both 'web' and 'websecure'."""
    r = _run_starlark(
        tmp_path,
        """
load('@NETWORKING/traefik_helpers.star', 'build_entrypoints')
r = {'entrypoints': build_entrypoints(True, True)}
""",
    )
    entrypoints = r["entrypoints"]
    assert entrypoints == "web,websecure"
    entrypoints_list = entrypoints.split(",")
    assert "web" in entrypoints_list
    assert "websecure" in entrypoints_list
    assert entrypoints_list == ["web", "websecure"]


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_build_entrypoints_edge_cases_and_constants(tmp_path):
    """build_entrypoints handles https-only, neither enabled fallback, and matches constants."""
    r = _run_starlark(
        tmp_path,
        """
load('@NETWORKING/traefik_helpers.star', 'build_entrypoints')
load('@NETWORKING/traefik_constants.star', 'TRAEFIK_WEB_ENTRYPOINT', 'TRAEFIK_WEBSECURE_ENTRYPOINT', 'TRAEFIK_BACKEND_ENABLE_HTTP', 'TRAEFIK_BACKEND_ENABLE_HTTPS', 'TRAEFIK_FRONTEND_ENABLE_HTTP', 'TRAEFIK_FRONTEND_ENABLE_HTTPS')
r = {
    'https_only': build_entrypoints(False, True),
    'neither': build_entrypoints(False, False),
    'backend_defaults': build_entrypoints(TRAEFIK_BACKEND_ENABLE_HTTP, TRAEFIK_BACKEND_ENABLE_HTTPS),
    'frontend_defaults': build_entrypoints(TRAEFIK_FRONTEND_ENABLE_HTTP, TRAEFIK_FRONTEND_ENABLE_HTTPS),
    'web_constant': TRAEFIK_WEB_ENTRYPOINT,
    'websecure_constant': TRAEFIK_WEBSECURE_ENTRYPOINT,
}
""",
    )
    assert r["https_only"] == "websecure"
    assert "websecure" in r["https_only"].split(",")
    assert "web" not in r["https_only"].split(",")

    # When both HTTP and HTTPS are disabled, fallback guarantees at least the default web entrypoint
    assert r["neither"] == "web"
    assert r["web_constant"] == "web"
    assert r["websecure_constant"] == "websecure"

    # Backend default in Traefik constants is HTTP only; frontend default is HTTP and HTTPS
    assert r["backend_defaults"] == "web"
    assert r["frontend_defaults"] == "web,websecure"


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_traefik_constants_pin_network_and_port_contract(tmp_path):
    r = _run_starlark(
        tmp_path,
        """
load('@NETWORKING/traefik_constants.star', 'TRAEFIK_CONFIG', 'TRAEFIK_DOCKER_NETWORK')
r = {
    'config_network': TRAEFIK_CONFIG['network'],
    'docker_network': TRAEFIK_DOCKER_NETWORK,
    'default_port': TRAEFIK_CONFIG['default_port'],
}
""",
    )

    # These assertions intentionally pin the Traefik networking contract. Update the expected
    # values when the underlying constants change deliberately.
    assert r == {
        "config_network": "traefik-public",
        "docker_network": "flisk_project_traefik-public",
        "default_port": 8080,
    }


def test_tiltfile_keeps_traefik_in_focus_mode():
    source = (REPO_ROOT / "cli" / "templates" / "Tiltfile.hbs").read_text()
    assert "'traefik'" in source
    assert "init-networks" in source


def _infra_loader_source() -> str:
    return (
        REPO_ROOT
        / "runtime" / "engine"
        / "topologies"
        / "tilt"
        / "resources"
        / "infra-loader.star"
    ).read_text()


def test_standalone_traefik_uses_selected_ports_without_stopping_other_projects():
    """Traefik must use selected ingress ports without stopping a different project's proxy."""
    source = _infra_loader_source()
    assert "_stop_conflicting_traefik" not in source
    assert "os.environ.get('FLISK_HTTP_PORT', '8080')" in source
    assert "os.environ.get('FLISK_HTTPS_PORT', '8443')" in source
    assert "docker stop" not in source


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_standalone_compose_enables_file_provider_and_wake_gateway(tmp_path):
    """openspec/changes/prioritized-cold-start (D4): a `sablier.deferStart`
    resource's static route needs Traefik's file provider enabled and a wake
    gateway running, even in a landscape with no such resource yet (harmless:
    an empty dynamic directory yields zero extra routes)."""
    r = _run_starlark(
        tmp_path,
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        "r = {'yaml': generate_standalone_traefik_compose(True)}\n",
    )
    yaml_text = r["yaml"]
    assert "--providers.file.directory=/etc/traefik/dynamic" in yaml_text
    assert "--providers.file.watch=true" in yaml_text
    assert "--experimental.plugins.sablier.modulename=github.com/sablierapp/sablier-traefik-plugin" in yaml_text
    # v1.3.1 fails Traefik's plugin integrity check and disables every plugin (#1235).
    assert "--experimental.plugins.sablier.version=v1.3.0" in yaml_text
    assert "/etc/traefik/dynamic:ro" in yaml_text
    assert "wake-gateway:" in yaml_text
    assert "/home/bun/.tilt-dev:ro" in yaml_text


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_standalone_compose_uses_selected_ingress_ports(tmp_path):
    r = _run_starlark(
        tmp_path,
        "os.environ['FLISK_HTTP_PORT'] = '18080'\n"
        "os.environ['FLISK_HTTPS_PORT'] = '18443'\n"
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        "r = {'yaml': generate_standalone_traefik_compose(False, os.environ['FLISK_HTTP_PORT'], os.environ['FLISK_HTTPS_PORT'])}\n",
    )
    assert '\"127.0.0.1:18080:80\"' in r["yaml"]
    assert '\"127.0.0.1:18443:443\"' in r["yaml"]
    assert "--api.insecure" not in r["yaml"]


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_standalone_compose_omits_https_when_disabled(tmp_path):
    r = _run_starlark(
        tmp_path,
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        "r = {'yaml': generate_standalone_traefik_compose(False, '18080', None)}\n",
    )
    yaml_text = r["yaml"]
    command = _compose_section(yaml_text, "    command:\n", "    ports:\n")
    ports = _compose_section(yaml_text, "    ports:\n", "    volumes:\n")

    assert "--entrypoints.web.address=:80" in command
    assert "--entrypoints.websecure.address=:443" not in command
    assert '"127.0.0.1:18080:80"' in ports
    assert ":443" not in ports


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_standalone_compose_bind_address_is_opt_in(tmp_path):
    """GHSA-3hj3-f39v-j2x5: dev ports stay on loopback unless FLISK_BIND_ADDRESS is set."""
    r = _run_starlark(
        tmp_path,
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        "r = {'yaml': generate_standalone_traefik_compose(False, '8080', '8443', '0.0.0.0')}\n",
    )
    assert '\"0.0.0.0:8080:80\"' in r["yaml"]
    assert '\"0.0.0.0:8443:443\"' in r["yaml"]


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_wake_gateway_mounts_project_root_at_its_own_absolute_path(tmp_path):
    """The gateway runs `docker compose up --no-build` with the same compose
    files Tilt uses; relative paths inside them resolve client-side, so the
    project must exist at the same absolute path in the gateway container."""
    r = _run_starlark(
        tmp_path,
        "os.environ['FLISK_PROJECT_ROOT'] = '/Users/dev/flisk-erp-system/.flisk/.flisk-out/../..'\n"
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        "r = {'yaml': generate_standalone_traefik_compose(True)}\n",
    )
    expected_mount = "\n      - /Users/dev/flisk-erp-system:/Users/dev/flisk-erp-system:ro"
    assert expected_mount in r["yaml"]


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_wake_gateway_mounts_project_root_with_spaces(tmp_path):
    r = _run_starlark(
        tmp_path,
        "os.environ['FLISK_PROJECT_ROOT'] = '/Users/dev/flisk demo/.flisk/.flisk-out/../..'\n"
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        "r = {'yaml': generate_standalone_traefik_compose(True)}\n",
    )
    expected_mount = "\n      - /Users/dev/flisk demo:/Users/dev/flisk demo:ro"
    assert expected_mount in r["yaml"]


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_project_root_abspath_resolves_relative_root_against_project_directory(tmp_path):
    """Assert a relative project root resolves against the project directory."""
    project_dir = tmp_path / "my_project"
    project_dir.mkdir()
    real_project_dir = str(project_dir.resolve())
    orig_cwd = os.getcwd()

    r = _run_starlark(
        project_dir,
        "load('@COMPOSE/traefik_standalone.star', 'project_root_abspath')\n"
        "os.environ['FLISK_PROJECT_ROOT'] = '.'\n"
        "root_dot = project_root_abspath()\n"
        "os.environ['FLISK_PROJECT_ROOT'] = 'services/backend'\n"
        "root_sub = project_root_abspath()\n"
        "os.environ['FLISK_PROJECT_ROOT'] = './nested/../nested'\n"
        "root_nested = project_root_abspath()\n"
        "r = {\n"
        "    'root_dot': root_dot,\n"
        "    'root_sub': root_sub,\n"
        "    'root_nested': root_nested,\n"
        "}\n",
    )

    assert os.path.isabs(r["root_dot"])
    assert r["root_dot"] == real_project_dir
    assert r["root_sub"] == f"{real_project_dir}/services/backend"
    assert r["root_nested"] == f"{real_project_dir}/nested"
    assert os.getcwd() == orig_cwd


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_project_root_abspath_returns_absolute_root_unchanged(tmp_path):
    """Assert an absolute project root is returned unchanged."""
    abs_path = "/Users/dev/flisk-erp-system"
    r = _run_starlark(
        tmp_path,
        f"os.environ['FLISK_PROJECT_ROOT'] = '{abs_path}'\n"
        "load('@COMPOSE/traefik_standalone.star', 'project_root_abspath')\n"
        "r = {'root': project_root_abspath()}\n",
    )
    assert r["root"] == abs_path


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_project_root_abspath_normalizes_dot_segments_and_handles_unset(tmp_path):
    """Assert dot segments in absolute paths are normalized and unset env returns empty string."""
    r = _run_starlark(
        tmp_path,
        "os.environ['FLISK_PROJECT_ROOT'] = '/Users/dev/flisk-erp-system/.flisk/.flisk-out/../..'\n"
        "load('@COMPOSE/traefik_standalone.star', 'project_root_abspath')\n"
        "normalized = project_root_abspath()\n"
        "if 'FLISK_PROJECT_ROOT' in os.environ:\n"
        "    os.environ.pop('FLISK_PROJECT_ROOT')\n"
        "unset_root = project_root_abspath()\n"
        "r = {'normalized': normalized, 'unset_root': unset_root}\n",
    )
    assert r["normalized"] == "/Users/dev/flisk-erp-system"
    assert r["unset_root"] == ""


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_wake_gateway_runs_non_root_and_joins_docker_socket_group(tmp_path):
    """The gateway image runs as bun (uid 1000), so its tilt session token is
    mounted under bun's home and it reaches the Docker socket through a
    supplementary group, not root."""
    r = _run_starlark(
        tmp_path,
        "os.environ['HOME'] = '/Users/dev'\n"
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        "r = {'yaml': generate_standalone_traefik_compose(True)}\n",
    )
    yaml_text = r["yaml"]
    assert "      - /Users/dev/.tilt-dev:/home/bun/.tilt-dev:ro" in yaml_text
    assert "/root/.tilt-dev" not in yaml_text
    assert 'group_add:\n      - "0"' in yaml_text


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_docker_socket_gid_default_when_unknown(tmp_path):
    """Assert the default group ('0') when the Docker socket GID is unknown."""
    r = _run_starlark(
        tmp_path,
        """
if 'FLISK_DOCKER_SOCKET_GID' in os.environ:
    os.environ.pop('FLISK_DOCKER_SOCKET_GID')
load('@COMPOSE/traefik_standalone.star', 'docker_socket_gid', 'generate_standalone_traefik_compose')
r = {
    'gid': docker_socket_gid(),
    'yaml': generate_standalone_traefik_compose(True),
}
""",
    )
    assert r["gid"] == "0"
    assert 'group_add:\n      - "0"' in r["yaml"]


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_docker_socket_gid_uses_known_group_id(tmp_path):
    """Assert the Docker socket group ID is used when it is known."""
    r = _run_starlark(
        tmp_path,
        """
os.environ['FLISK_DOCKER_SOCKET_GID'] = '999'
load('@COMPOSE/traefik_standalone.star', 'docker_socket_gid', 'generate_standalone_traefik_compose')
r = {
    'gid': docker_socket_gid(),
    'yaml': generate_standalone_traefik_compose(True),
}
""",
    )
    assert r["gid"] == "999"
    assert 'group_add:\n      - "999"' in r["yaml"]


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_docker_socket_gid_custom_known_values(tmp_path):
    """Assert custom known GIDs (e.g. 1001, 114) are preserved and passed to wake-gateway."""
    r = _run_starlark(
        tmp_path,
        """
os.environ['FLISK_DOCKER_SOCKET_GID'] = '1001'
load('@COMPOSE/traefik_standalone.star', 'docker_socket_gid', 'generate_standalone_traefik_compose')
gid_1001 = docker_socket_gid()
yaml_1001 = generate_standalone_traefik_compose(True)

os.environ['FLISK_DOCKER_SOCKET_GID'] = '114'
gid_114 = docker_socket_gid()
yaml_114 = generate_standalone_traefik_compose(True)

r = {
    'gid_1001': gid_1001,
    'yaml_1001': yaml_1001,
    'gid_114': gid_114,
    'yaml_114': yaml_114,
}
""",
    )
    assert r["gid_1001"] == "1001"
    assert 'group_add:\n      - "1001"' in r["yaml_1001"]
    assert r["gid_114"] == "114"
    assert 'group_add:\n      - "114"' in r["yaml_114"]


@pytest.mark.skipif(
    shutil.which("docker") is None or subprocess.run(["docker", "info"], capture_output=True).returncode != 0,
    reason="Docker daemon not running",
)
def test_wake_gateway_image_is_non_root_and_can_use_docker_socket():
    """Build the gateway image and run it the way the generated compose does
    (socket mounted, socket group added): it must not run as uid 0 and must be
    able to talk to the Docker daemon."""
    context = REPO_ROOT / "runtime" / "engine" / "assets" / "docker" / "wake-gateway"
    tag = "flisk-wake-gateway-nonroot-test:local"
    build = subprocess.run(["docker", "build", "-q", "-t", tag, str(context)], capture_output=True, text=True, timeout=900)
    assert build.returncode == 0, build.stderr[-3000:]
    try:
        socket_gid = subprocess.run(
            ["docker", "run", "--rm", "-v", "/var/run/docker.sock:/var/run/docker.sock", "alpine", "stat", "-c", "%g", "/var/run/docker.sock"],
            capture_output=True,
            text=True,
            timeout=300,
        ).stdout.strip()
        run = subprocess.run(
            [
                "docker", "run", "--rm", "--group-add", socket_gid,
                "-v", "/var/run/docker.sock:/var/run/docker.sock",
                "--entrypoint", "sh", tag,
                "-c", "id -u; docker version --format '{{.Server.Version}}'",
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )
        assert run.returncode == 0, run.stderr[-3000:]
        uid, server_version = run.stdout.split()[:2]
        assert uid == "1000"
        assert server_version
    finally:
        subprocess.run(["docker", "rmi", "-f", tag], capture_output=True)


INFRA_LOADER = REPO_ROOT / "runtime" / "engine" / "topologies" / "tilt" / "resources" / "infra-loader.star"


def test_traefik_waits_for_the_golden_step():
    """Traefik pulls its image while the golden step may be building eight images (and pruning old ones).

    On the containerd image store the two collide: `failed to extract layer ... Lchown .../usr/local/bin/traefik: no such file or
    directory` failed the demo on every PR that changed the golden Dockerfile, because no prebuilt image exists for a new hash.
    The golden resource is an instant no-op when nothing needs building, so traefik can always wait for it.
    """
    source = INFRA_LOADER.read_text()
    standalone = source.split("def _load_standalone_traefik", 1)[1].split("\ndef ", 1)[0]
    assert "golden_image_resource" in standalone and "resource_deps" in standalone
    assert 'resource_deps=_proxy_deps(' in standalone
    primary = source.split("def _load_proxy", 1)[1].split("\ndef ", 1)[0]
    assert "_proxy_deps(" in primary
    assert "_load_proxy(should_enable, root_prefix, env_file, write_fn, golden_image_resource)" in source


def test_postgres_and_nats_wait_for_the_golden_step_too():
    """The same pull/extract collision hit `postgres` (flisk-example-database-management) once traefik waited."""
    source = INFRA_LOADER.read_text()
    postgres = source.split("def _register_platform_postgres", 1)[1].split("\ndef ", 1)[0]
    assert "resource_deps=_proxy_deps(['init-networks'], golden_image_resource)" in postgres
    database = source.split("def _load_database_management", 1)[1].split("\ndef ", 1)[0]
    assert "resource_deps=_proxy_deps([], golden_image_resource)" in database
    assert "golden_image_resource=golden_image_resource" in database
    assert "_load_database_management(should_enable, root_prefix, env_file, write_fn, golden_image_resource)" in source


def _gateway_image_ref(tmp_path: Path, run: str, project: str, source_dir: Path) -> str:
    """The `image:` line of the wake-gateway service as project `project` generates it."""
    tmp_path = tmp_path / run
    tmp_path.mkdir()
    root = tmp_path / "project"
    (root / ".flisk").mkdir(parents=True)
    # Tilt resolves the gateway sources relative to the Tiltfile directory, as it does in a project.
    vendored = tmp_path / ".flisk" / ".flisk-out" / "flisk-cli-ext" / "engine" / "assets" / "docker" / "wake-gateway"
    shutil.copytree(source_dir, vendored)
    (root / ".flisk" / "project.json").write_text(json.dumps({"project": {"name": project}}))
    r = _run_starlark(
        tmp_path,
        f"os.environ['FLISK_PROJECT_ROOT'] = '{root}'\n"
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        f"r = {{'yaml': generate_standalone_traefik_compose(True, '8080', '8443', '127.0.0.1')}}\n",
    )
    block = r["yaml"].split("  wake-gateway:\n", 1)[1].split("    networks:", 1)[0]
    # The container stays per project; only the image is shared.
    assert f"container_name: {project}-wake-gateway" in block, block
    lines = [line.strip() for line in block.splitlines() if line.strip().startswith("image:")]
    assert len(lines) == 1, block
    return lines[0][len("image:"):].strip()


def _copy_gateway_sources(dest: Path) -> Path:
    src = REPO_ROOT / "runtime" / "engine" / "assets" / "docker" / "wake-gateway"
    dest.mkdir(parents=True)
    for name in ("Dockerfile", "decide.ts", "server.ts"):
        shutil.copy(src / name, dest / name)
    return dest


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_wake_gateway_image_is_shared_by_projects_and_follows_its_content(tmp_path):
    """flisk#3837: one `flisk-wake-gateway:<tilt version>-<hash>` per machine, not one image per project."""
    sources = _copy_gateway_sources(tmp_path / "gw")
    first = _gateway_image_ref(tmp_path, "a", "alpha", sources)
    second = _gateway_image_ref(tmp_path, "b", "beta", sources)
    assert first == second
    assert first.startswith("flisk-wake-gateway:0.37.7-")
    assert "alpha" not in first and "beta" not in first

    # A different Tilt version in the Dockerfile: another tag, and the version is visible in it.
    dockerfile = sources / "Dockerfile"
    dockerfile.write_text(dockerfile.read_text().replace("ARG TILT_VERSION=0.37.7", "ARG TILT_VERSION=0.99.0"))
    bumped = _gateway_image_ref(tmp_path, "c", "alpha", sources)
    assert bumped != first
    assert bumped.startswith("flisk-wake-gateway:0.99.0-")

    # Any other Dockerfile change, or a change to a source file it copies, changes the tag too.
    dockerfile.write_text(dockerfile.read_text() + "\n# touched\n")
    assert _gateway_image_ref(tmp_path, "d", "alpha", sources) != bumped
    after_dockerfile = _gateway_image_ref(tmp_path, "e", "alpha", sources)
    (sources / "server.ts").write_text((sources / "server.ts").read_text() + "\n// touched\n")
    assert _gateway_image_ref(tmp_path, "f", "alpha", sources) != after_dockerfile


@pytest.mark.skipif(shutil.which("tilt") is None, reason="tilt CLI not installed")
def test_wake_gateway_compose_builds_the_shared_image_name(tmp_path):
    sources = _copy_gateway_sources(tmp_path / "gw")
    run = tmp_path / "run"
    (run / ".flisk" / ".flisk-out" / "flisk-cli-ext" / "engine" / "assets" / "docker").mkdir(parents=True)
    shutil.copytree(sources, run / ".flisk" / ".flisk-out" / "flisk-cli-ext" / "engine" / "assets" / "docker" / "wake-gateway")
    r = _run_starlark(
        run,
        "load('@COMPOSE/traefik_standalone.star', 'generate_standalone_traefik_compose')\n"
        f"r = {{'yaml': generate_standalone_traefik_compose(True, '8080', '8443', '127.0.0.1')}}\n",
    )
    block = r["yaml"].split("  wake-gateway:\n", 1)[1].split("    networks:", 1)[0]
    assert "    build: ./flisk-cli-ext/engine/assets/docker/wake-gateway\n" in block
    assert "image: flisk-wake-gateway:" in block
