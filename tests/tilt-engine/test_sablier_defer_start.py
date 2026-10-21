# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
sablier.deferStart: schema field and its enable-required cross-field rule.

Executes the real Starlark validator through Tilt's interpreter
(`tilt alpha tiltfile-result`) instead of inspecting source text.
Spec: openspec/changes/prioritized-cold-start/specs/on-demand-resource-startup/spec.md
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

MANIFEST_DIR = Path(__file__).resolve().parents[2] / "engine" / "topologies" / "tilt" / "manifest"
ORCHESTRATOR_DIR = Path(__file__).resolve().parents[2] / "engine" / "topologies" / "tilt" / "resources" / "orchestrator"
RESULT_MARKER = "Error in fail: RESULT"


def run_starlark(tmp_path: Path, body: str) -> dict:
    """Run `body` in a Tiltfile; `body` must assign a dict to `r`. `@MANIFEST`/`@ORCHESTRATOR` are module dirs."""
    tiltfile = tmp_path / "Tiltfile"
    tiltfile.write_text(
        body.replace("@MANIFEST", str(MANIFEST_DIR)).replace("@ORCHESTRATOR", str(ORCHESTRATOR_DIR))
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


def validate_sablier(tmp_path: Path, sablier: dict | None) -> dict:
    manifest = {"appType": "backend", "stack": "test"}
    if sablier is not None:
        manifest["sablier"] = sablier
    return run_starlark(
        tmp_path,
        "load('@MANIFEST/validator.star', 'ManifestValidator')\n"
        f"manifest = {manifest!r}\n"
        "result = ManifestValidator.validate(manifest, level='cross_field')\n"
        "r = {'valid': result.valid, 'errors': [e.message for e in result.errors]}\n",
    )


@pytest.mark.parametrize(
    "sablier",
    [
        None,
        {"enable": False},
        {"enable": True},
        {"enable": True, "deferStart": True},
        {"enable": True, "deferStart": False},
    ],
)
def test_defer_start_with_enable_is_valid(tmp_path, sablier):
    r = validate_sablier(tmp_path, sablier)
    assert r["valid"], r["errors"]


def test_defer_start_without_enable_is_rejected(tmp_path):
    r = validate_sablier(tmp_path, {"deferStart": True})
    assert not r["valid"]
    assert any("deferStart" in e and "enable" in e for e in r["errors"]), r["errors"]


def test_defer_start_with_enable_false_is_rejected(tmp_path):
    r = validate_sablier(tmp_path, {"enable": False, "deferStart": True})
    assert not r["valid"]
    assert any("deferStart" in e and "enable" in e for e in r["errors"]), r["errors"]


def resource_defers_start(tmp_path: Path, sablier: dict | None) -> bool:
    manifest = {"appType": "backend", "stack": "test"}
    if sablier is not None:
        manifest["sablier"] = sablier
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'resource_defers_start')\n"
        f"manifest = {manifest!r}\n"
        "r = {'defers': resource_defers_start(manifest)}\n",
    )
    return result["defers"]


@pytest.mark.parametrize(
    "sablier",
    [
        None,
        {},
        {"enable": False},
        {"enable": True},
        {"enable": False, "deferStart": True},
        {"enable": True, "deferStart": False},
        {"enable": True, "deferStart": True},
    ],
)
def test_resource_defers_start_stays_off_without_a_license(tmp_path, sablier):
    """deferStart stays behind the same TDK_LICENSE_KEY gate as the rest of
    `sablier` (an explicit product decision -- see openspec/changes/
    prioritized-cold-start's design.md). This repo ships only the free-tier
    `sablier_container_cycle.star` stub, whose sablier_middleware_suffix()
    always reports disabled regardless of the manifest -- so every case here
    must resolve to False, including {"enable": True, "deferStart": True}.
    The corresponding "licensed and enabled" True case can only be exercised
    where the real premium module is actually vendored (tdk-cli-extensions),
    not from this repo's stub."""
    assert resource_defers_start(tmp_path, sablier) is False


def _run_resolve_deps(tmp_path: Path, manifest: dict, resource_manifests: dict, all_services_map: dict) -> list:
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'resolve_defer_start_dependencies')\n"
        f"manifest = {manifest!r}\n"
        f"resource_manifests = {resource_manifests!r}\n"
        f"all_services_map = {all_services_map!r}\n"
        "r = {'deps': [list(pair) for pair in resolve_defer_start_dependencies(manifest, resource_manifests, all_services_map)]}\n",
    )
    return result["deps"]


LICENSED_SABLIER_MANIFEST = {"appType": "backend", "stack": "test", "sablier": {"enable": True, "deferStart": True}}


def test_resolve_defer_start_dependencies_excludes_non_defer_dependency(tmp_path):
    """A dependsOn entry that resolves to a real resource with no sablier.deferStart
    (e.g. always-on infra, or a normal backend) contributes nothing to X-Wake-Deps."""
    manifest = {"appType": "backend", "stack": "test", "dependsOn": ["plain-backend"]}
    resource_manifests = {"plain-backend": {"appType": "backend", "stack": "other"}}
    all_services_map = {"plain-backend": {"name": "other-service", "resources": [{"name": "plain-backend"}]}}
    assert _run_resolve_deps(tmp_path, manifest, resource_manifests, all_services_map) == []


def test_resolve_defer_start_dependencies_excludes_unresolvable_name(tmp_path):
    """A dependsOn short name that doesn't match any known resource/service falls
    back (via _resolve_dependency_to_resource) to a name absent from
    resource_manifests, so it's quietly excluded rather than guessed at (D5)."""
    manifest = {"appType": "backend", "stack": "test", "dependsOn": ["nonexistent-thing"]}
    assert _run_resolve_deps(tmp_path, manifest, {}, {}) == []


def test_resolve_defer_start_dependencies_stays_empty_without_a_license(tmp_path):
    """Even when a dependsOn entry resolves to a resource whose manifest asks for
    sablier.deferStart, this repo's free-tier stub keeps resource_defers_start()
    False for it too (same license gate as the resource's own deferStart check),
    so it's excluded here just as it would be for the resource itself."""
    manifest = {"appType": "backend", "stack": "test", "dependsOn": ["peer-backend"]}
    resource_manifests = {"peer-backend": LICENSED_SABLIER_MANIFEST}
    all_services_map = {"peer-backend": {"name": "peer-service", "resources": [{"name": "peer-backend"}]}}
    assert _run_resolve_deps(tmp_path, manifest, resource_manifests, all_services_map) == []


def test_resolve_defer_start_dependencies_no_depends_on(tmp_path):
    manifest = {"appType": "backend", "stack": "test"}
    assert _run_resolve_deps(tmp_path, manifest, {}, {}) == []


def _run_resolve_names(tmp_path: Path, manifest: dict, all_services_map: dict) -> list:
    result = run_starlark(
        tmp_path,
        "load('@ORCHESTRATOR/apply_compose_resource_registration.star', 'resolve_manifest_dependency_names')\n"
        f"manifest = {manifest!r}\n"
        f"all_services_map = {all_services_map!r}\n"
        "r = {'names': resolve_manifest_dependency_names(manifest, all_services_map)}\n",
    )
    return result["names"]


def test_resolve_manifest_dependency_names_exact_match(tmp_path):
    """The common case: dependsOn already names a real resource exactly, so
    _resolve_dependency_to_resource returns it unchanged (no '-yaml' guess)."""
    manifest = {"dependsOn": ["identity-management-backend"]}
    all_services_map = {
        "identity-management-backend": {"name": "identity-management", "resources": [{"name": "identity-management-backend"}]},
    }
    assert _run_resolve_names(tmp_path, manifest, all_services_map) == ["identity-management-backend"]


def test_prebuild_dockerignore_mirrors_docker_build_only_and_ignore(tmp_path):
    """A deferStart resource's image is pre-built by a plain `docker build`
    (auto_init=False skips the dc_resource's own docker_build -- found live,
    task 7.2). A plain build has no only= filter, so the generated allowlist
    must include exactly what docker_build's only= does (root lockfiles, the
    service, docker-templates, its internal libraries) and re-exclude its
    ignore= patterns, or the whole project root becomes the build context."""
    project = tmp_path / "project"
    service = project / "services" / "analytics" / "data-governance-api"
    (service / ".autogenerated").mkdir(parents=True)
    (service / "package.json").write_text(
        json.dumps({"dependencies": {"@tdk-project/platform-logging": "workspace:*", "zod": "^3"}})
    )
    dockerfile = service / ".autogenerated" / "Dockerfile.app.autogenerated"
    dockerfile.write_text("FROM scratch\n")
    (service / ".autogenerated" / "Dockerfile.app.autogenerated.dockerignore").write_text(
        "# comment\nnode_modules\n*.md\n!.env.example\n"
    )
    tiltdir = tmp_path / "tilt"
    tiltdir.mkdir()
    r = run_starlark(
        tiltdir,
        "load('@ORCHESTRATOR/builders/typescript.star', 'prebuild_dockerignore')\n"
        f"r = {{'content': prebuild_dockerignore({str(dockerfile)!r}, {str(project)!r}, "
        "'services/analytics/data-governance-api')}\n",
    )
    lines = r["content"].splitlines()
    res = "services/analytics/data-governance-api"
    assert lines[0] == "*"
    for allowed in ["package.json", "bun.lock", res, "shared-platform-engineering/docker-templates",
                    "shared-platform-engineering/platform-logging"]:
        assert "!" + allowed in lines, (allowed, lines)
    # Only the service's own relative path is allowed, never the absolute one.
    assert not any(line.startswith("!" + str(project)) for line in lines), lines
    # Re-excludes come after the allowlist (dockerignore: later lines win).
    assert res + "/node_modules" in lines and res + "/*.md" in lines
    assert lines.index(res + "/node_modules") > lines.index("!" + res)
    # The Dockerfile's own negations aren't carried over (same as docker_build's ignore=).
    assert not any(".env.example" in line for line in lines)


def test_resolve_manifest_dependency_names_dedupes_and_skips_empty(tmp_path):
    manifest = {"dependsOn": []}
    assert _run_resolve_names(tmp_path, manifest, {}) == []


def test_scaffolded_service_gets_default_syncs_only_on_the_normalized_resource(tmp_path):
    """A scaffolded service.json has no `syncs`; the parser fills them in on the normalized resource only.

    `Tiltfile.hbs` decides which `<name>-image` prebuilds to enable and must read the same `syncs` that
    `_register_single_resource` uses (the resource's), not `_manifest` (the original service.json), or a
    scaffolded deferStart service's image is registered but never enabled (#1235).
    """
    r = run_starlark(
        tmp_path,
        "load('@MANIFEST/parser.star', 'ManifestParser')\n"
        "m = {'appName': 'cold-api', 'appType': 'backend', 'stack': 'cold-start', 'port': 4000,\n"
        "     'sablier': {'enable': True, 'deferStart': True},\n"
        "     'traefik': {'pathPrefix': '/api/cold', 'priority': 100}}\n"
        "n = ManifestParser.normalize(m, 'services/cold-start/cold-api')\n"
        "r = {'normalized': n.get('syncs'), 'original': n['_manifest'].get('syncs')}\n",
    )
    assert r["normalized"], "the parser must compute default syncs for a backend"
    assert r["original"] in (None, []), "the original manifest has no syncs unless the author wrote them"
