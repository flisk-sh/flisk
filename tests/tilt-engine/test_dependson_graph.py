# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
How a service.json `dependsOn` becomes Tilt `resource_deps`, found by the dependsOn graph chaos tests (tests/chaos).

Executes the real Starlark through Tilt's interpreter (`tilt alpha tiltfile-result`), like test_dependson_platform_postgres.py.
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
TILT_DIR = REPO_ROOT / "runtime" / "engine" / "topologies" / "tilt"
ORCHESTRATOR_DIR = TILT_DIR / "resources" / "orchestrator"
COMMON_DIR = TILT_DIR / "common"
RESULT_MARKER = "Error in fail: RESULT"


def run_starlark(tmp_path: Path, body: str) -> dict:
    """Run `body` in a Tiltfile; it must assign a dict to `r`. `@ORCHESTRATOR` and `@COMMON` are module directories."""
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        body.replace("@ORCHESTRATOR", str(ORCHESTRATOR_DIR)).replace("@COMMON", str(COMMON_DIR))
        + "\nfail('RESULT' + encode_json(r))\n"
    )
    proc = subprocess.run(
        ["tilt", "alpha", "tiltfile-result", "-f", str(tiltfile)],
        capture_output=True,
        text=True,
        timeout=180,
        env={**os.environ},
    )
    output = proc.stdout + proc.stderr
    assert RESULT_MARKER in output, output[-3000:]
    return json.loads(output.split(RESULT_MARKER, 1)[1].strip())


# Two stacks. `shop` has a backend, a frontend and a worker; `core` has one backend.
SERVICES = """
all_services = {
    'shop': {'name': 'shop', 'stack': 'shop', 'resources': [
        {'name': 'orders'}, {'name': 'storefront', 'frontend': True}, {'name': 'mailer'}]},
    'core': {'name': 'core', 'stack': 'core', 'resources': [{'name': 'ledger'}]},
}
for _svc in list(all_services.values()):
    for _res in _svc['resources']:
        all_services[_res['name']] = _svc
"""


def deps(tmp_path: Path, res_name: str, manifest: dict, resource_manifests: dict | None = None, frontend: bool = False) -> list:
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps')\n"
        + SERVICES
        + f"res = {{'name': {res_name!r}, 'frontend': {frontend!r}}}\n"
        + f"r = {{'deps': build_resource_deps(res, {res_name!r}, {manifest!r}, {{}}, [], {{}}, {resource_manifests or {}!r}, None, all_services)}}\n",
    )
    return result["deps"]


@TILT_REQUIRED
def test_declared_dependencies_reads_both_keys_and_ignores_wrong_types(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@COMMON/dependencies.star', 'declared_dependencies')\n"
        "r = {\n"
        "  'list': declared_dependencies({'dependsOn': ['a', 'b']}),\n"
        "  'legacy': declared_dependencies({'dependsOn': ['a'], 'dependencies': ['b', 'a']}),\n"
        "  'string': declared_dependencies({'dependsOn': 'a'}),\n"
        "  'dict': declared_dependencies({'dependsOn': {'a': True}}),\n"
        "  'none': declared_dependencies({'dependsOn': None}),\n"
        "  'mixed': declared_dependencies({'dependsOn': ['a', 7, None]}),\n"
        "  'empty': declared_dependencies(None),\n"
        "}\n",
    )
    assert result == {
        "list": ["a", "b"],
        "legacy": ["a", "b"],
        "string": [],
        "dict": [],
        "none": [],
        "mixed": [],
        "empty": [],
    }


@TILT_REQUIRED
def test_a_service_name_is_an_edge_to_that_service(tmp_path):
    assert deps(tmp_path, "ledger", {"dependsOn": ["orders"]}) == ["orders"]


@TILT_REQUIRED
def test_a_stack_name_is_an_edge_to_the_stacks_backend_side_services(tmp_path):
    """The schema allows a stack name. Frontends are left out, as in the --focus closure."""
    assert deps(tmp_path, "ledger", {"dependsOn": ["shop"]}) == ["orders", "mailer"]


@TILT_REQUIRED
def test_a_service_does_not_wait_for_itself_through_its_own_stack(tmp_path):
    assert deps(tmp_path, "orders", {"dependsOn": ["shop"]}) == ["mailer"]


@TILT_REQUIRED
def test_the_deprecated_dependencies_key_counts(tmp_path):
    assert deps(tmp_path, "ledger", {"dependencies": ["orders"]}) == ["orders"]


@TILT_REQUIRED
def test_a_wrong_typed_dependson_gives_no_edge_and_no_crash(tmp_path):
    for value in ("orders", {"orders": True}, None, 7):
        assert deps(tmp_path, "ledger", {"dependsOn": value}) == [], value


@TILT_REQUIRED
def test_a_frontend_waits_for_a_backend_in_another_stack(tmp_path):
    """backendName was looked up among the frontend's own stack only, so a cross-stack backend gave no edge."""
    assert deps(tmp_path, "storefront", {"backendName": "ledger"}, frontend=True) == ["ledger"]


LIBRARY_SERVICES = """
all_services = {
    'core': {'name': 'core', 'stack': 'core', 'resources': [
        {'name': 'ledger', '_manifest': {'appType': 'backend'}},
        {'name': 'kit', '_manifest': {'appType': 'library'}},
        {'name': 'sdk-x', '_manifest': {'appType': 'sdk'}}]},
}
for _svc in list(all_services.values()):
    for _res in _svc['resources']:
        all_services[_res['name']] = _svc
"""


@TILT_REQUIRED
def test_a_stack_name_leaves_out_resources_the_registration_loop_skips(tmp_path):
    """library, sdk and infra get no Tilt resource, so nothing can wait for them."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'resolve_dependency_to_resources')\n"
        + LIBRARY_SERVICES
        + "r = {'stack': resolve_dependency_to_resources('core', all_services)}\n",
    )
    assert result["stack"] == ["ledger"]


@TILT_REQUIRED
def test_a_direct_dependency_on_a_library_or_sdk_is_no_edge_and_no_fallback(tmp_path):
    """A library or sdk gets no Tilt resource and no `-yaml` one either, so depending on it used to make Tilt warn
    "dependency on unknown resource ... ignored". The ordering edge never existed; now nothing is asked for."""
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'build_resource_deps', 'resolve_dependency_to_resources')\n"
        + LIBRARY_SERVICES
        + "r = {\n"
        "  'resolved': resolve_dependency_to_resources('kit', all_services),\n"
        "  'deps': build_resource_deps({'name': 'ledger'}, 'ledger', {'dependsOn': ['kit', 'sdk-x', 'ghost']}, {}, [], {}, {}, None, all_services),\n"
        "}\n",
    )
    assert result["resolved"] == []
    # kit and sdk-x leave nothing behind; the unknown name ghost keeps the behaviour it always had.
    assert "kit" not in result["deps"] and "kit-yaml" not in result["deps"]
    assert "sdk-x" not in result["deps"] and "sdk-x-yaml" not in result["deps"]
    assert result["deps"] == ["ghost-yaml"]


@TILT_REQUIRED
def test_resolve_dependency_to_resources(tmp_path):
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'resolve_dependency_to_resources')\n"
        + SERVICES
        + "r = {\n"
        "  'service': resolve_dependency_to_resources('orders', all_services),\n"
        "  'stack': resolve_dependency_to_resources('shop', all_services),\n"
        "  'postgres': resolve_dependency_to_resources('database-management', all_services),\n"
        "  'unknown': resolve_dependency_to_resources('ghost', all_services),\n"
        "  'no map': resolve_dependency_to_resources('orders', None),\n"
        "}\n",
    )
    assert result == {
        "service": ["orders"],
        "stack": ["orders", "mailer"],
        "postgres": ["postgres"],
        "unknown": [],
        "no map": [],
    }


def cycle(tmp_path: Path, edges: dict) -> list:
    return run_starlark(
        tmp_path,
        "load('@COMMON/dependencies.star', 'find_dependency_cycle')\n"
        f"r = {{'cycle': find_dependency_cycle({edges!r})}}\n",
    )["cycle"]


@TILT_REQUIRED
def test_find_dependency_cycle_finds_a_circle_and_names_it(tmp_path):
    assert cycle(tmp_path, {"a": ["b"], "b": ["a"]}) == ["a", "b", "a"]
    found = cycle(tmp_path, {"a": ["b"], "b": ["c"], "c": ["a"], "d": []})
    assert found[0] == found[-1] and set(found) == {"a", "b", "c"}
    # Only the circle: a service that merely waits for it is not part of it.
    assert set(cycle(tmp_path, {"x": ["a"], "a": ["b"], "b": ["a"]})) == {"a", "b"}


@TILT_REQUIRED
def test_find_dependency_cycle_has_no_false_positives(tmp_path):
    assert cycle(tmp_path, {}) == []
    assert cycle(tmp_path, {"a": [], "b": ["a"], "c": ["a", "b"]}) == []
    # A diamond reaches the same service twice and is not a circle.
    assert cycle(tmp_path, {"a": ["b", "c"], "b": ["d"], "c": ["d"], "d": []}) == []
    # A self edge is dropped on purpose (_build_resource_deps), and a name that is no service is ignored.
    assert cycle(tmp_path, {"a": ["a", "ghost"]}) == []


@TILT_REQUIRED
def test_find_dependency_cycle_handles_a_long_chain_and_a_long_circle(tmp_path):
    chain = {f"s{i}": [f"s{i + 1}"] for i in range(300)}
    chain["s300"] = []
    assert cycle(tmp_path, chain) == []
    chain["s300"] = ["s0"]
    found = cycle(tmp_path, chain)
    assert found[0] == found[-1] and len(found) == 302


@TILT_REQUIRED
def test_dependson_condition_service_healthy_adds_healthy_resource_edge(tmp_path):
    """#3061: condition: 'service_healthy' waits for <dependency>-healthy."""
    manifest = {
        "dependsOn": [{"name": "orders", "condition": "service_healthy"}]
    }
    assert deps(tmp_path, "ledger", manifest) == ["orders", "orders-healthy"]


@TILT_REQUIRED
def test_dependson_condition_service_started_keeps_default_edge(tmp_path):
    """#3061: condition: 'service_started' keeps standard start edge without waiting for healthy/done."""
    manifest = {
        "dependsOn": [{"name": "orders", "condition": "service_started"}]
    }
    assert deps(tmp_path, "ledger", manifest) == ["orders"]

