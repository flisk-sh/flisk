# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Tests for publishing the golden images to more than one registry.

Covers two things:
- push-golden-images.sh builds each golden target once and tags it in every registry it is given, with the hash label
  the local build checks and the source label GHCR links a package to its repository by
- the registry the golden docs tell users to set is one the publish workflow pushes to (regression: the docs named
  docker.io/flisk-sh, which never existed, so following them always fell back to a local build)
"""

import fnmatch
import hashlib
import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PUSH = REPO_ROOT / "scripts" / "golden" / "push-golden-images.sh"
PUBLISHED = REPO_ROOT / "scripts" / "golden" / "golden-published.sh"
GOLDEN_BUILD = REPO_ROOT / "runtime" / "engine" / "topologies" / "platform" / "docker" / "build" / "golden_image_build.star"
WORKFLOW = REPO_ROOT / ".github" / "workflows" / "publish-golden-images.yml"
DOCS = REPO_ROOT / "runtime" / "engine" / "docs" / "GOLDEN_IMAGE_INTEGRATION.md"
LAYERS = ["l1", "l2", "l3-backend", "l3-frontend", "l4-backend", "l4-backend-node", "l4-frontend", "l4-migrator"]
SOURCE = "org.opencontainers.image.source=https://github.com/flisk-sh/flisk"


@pytest.mark.skipif(os.name == "nt", reason="runs a POSIX shell script")
class TestPushToEveryRegistry:
    """push-golden-images.sh pushes the same build to each registry."""

    @staticmethod
    def _run(tmp_path: Path, *registries: str) -> tuple[subprocess.CompletedProcess, list[list[str]], str]:
        bin_dir = tmp_path / "bin"
        calls = tmp_path / "calls"
        bin_dir.mkdir()
        calls.mkdir()
        docker = bin_dir / "docker"
        # One file per docker call, one argument per line, so arguments with spaces stay whole.
        docker.write_text(
            "#!/bin/bash\n"
            f'n=$(ls "{calls}" | wc -l | tr -d " ")\n'
            f'printf "%s\\n" "$@" > "{calls}/$n"\n',
            encoding="utf-8",
        )
        docker.chmod(docker.stat().st_mode | stat.S_IXUSR)
        golden = tmp_path / "golden"
        golden.mkdir()
        dockerfile = golden / "golden-layers.Dockerfile"
        dockerfile.write_text("FROM scratch AS l1_golden\n", encoding="utf-8")
        env = {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
        result = subprocess.run(
            ["bash", str(PUSH), str(golden), *registries], capture_output=True, text=True, env=env, check=False
        )
        made = [
            (calls / name).read_text(encoding="utf-8").splitlines()
            for name in sorted(os.listdir(calls), key=int)
        ]
        return result, made, hashlib.sha256(dockerfile.read_bytes()).hexdigest()

    @staticmethod
    def _values(args: list[str], flag: str) -> list[str]:
        return [args[i + 1] for i, arg in enumerate(args[:-1]) if arg == flag]

    def test_each_layer_is_built_once_and_tagged_in_both_registries(self, tmp_path):
        result, made, full_hash = self._run(tmp_path, "ghcr.io/flisk-sh", "docker.io/alexdykyi")

        assert result.returncode == 0, result.stderr
        assert len(made) == len(LAYERS)
        tag12 = full_hash[:12]
        for layer, args in zip(LAYERS, made):
            assert args[:3] == ["buildx", "build", "--push"]
            assert self._values(args, "-t") == [
                f"ghcr.io/flisk-sh/golden-{layer}:{tag12}",
                f"docker.io/alexdykyi/golden-{layer}:{tag12}",
            ]
            labels = self._values(args, "--label")
            assert f"flisk.golden.hash={full_hash}" in labels
            assert SOURCE in labels
            assert f"index:{SOURCE}" in self._values(args, "--annotation")

    def test_one_registry_still_works(self, tmp_path):
        result, made, full_hash = self._run(tmp_path, "ghcr.io/flisk-sh")

        assert result.returncode == 0, result.stderr
        assert [self._values(args, "-t") for args in made] == [
            [f"ghcr.io/flisk-sh/golden-{layer}:{full_hash[:12]}"] for layer in LAYERS
        ]

    def test_no_registry_fails_before_building(self, tmp_path):
        result, made, _ = self._run(tmp_path)

        assert result.returncode != 0
        assert "registry missing" in result.stderr
        assert made == []


class TestDocsNameAPublishedRegistry:
    """The FLISK_GOLDEN_REGISTRY the docs suggest must be one the workflow pushes to."""

    @staticmethod
    def _workflow_registries() -> list[str]:
        text = WORKFLOW.read_text(encoding="utf-8")
        push = re.search(r"push-golden-images\.sh \"\$RUNNER_TEMP/golden\"((?: \"\$\w+\")+)", text)
        assert push, "the workflow should call push-golden-images.sh with its registries"
        names = re.findall(r"\$(\w+)", push.group(1))
        values = {name: re.search(rf"^\s+{name}: (\S+)$", text, re.M) for name in names}
        assert all(values.values()), f"every registry passed to the script needs a value in env: {names}"
        return [match.group(1) for match in values.values()]

    def test_workflow_pushes_ghcr_and_docker_hub(self):
        registries = self._workflow_registries()

        assert registries[0] == "ghcr.io/flisk-sh"
        assert any(registry.startswith("docker.io/") for registry in registries)

    def test_ghcr_push_has_package_write_permission(self):
        text = WORKFLOW.read_text(encoding="utf-8")

        assert re.search(r"^\s+packages: write\b", text, re.M)
        assert re.search(r"registry: ghcr\.io\n\s+username: \$\{\{ github\.actor \}\}", text)

    def test_docs_suggest_a_registry_the_workflow_pushes_to(self):
        suggested = re.findall(r"FLISK_GOLDEN_REGISTRY=([\w./-]+)", DOCS.read_text(encoding="utf-8"))
        registries = [name for name in suggested if name not in ("off", "none")]

        assert registries, "the golden docs should show how to set FLISK_GOLDEN_REGISTRY"
        assert set(registries) <= set(self._workflow_registries())

    def test_flisk_up_pulls_from_the_registry_the_workflow_pushes_to_first(self):
        """Regression: the pull was opt-in, so every machine rebuilt the golden layers that GHCR already held."""
        default = re.search(r"^GOLDEN_REGISTRY_DEFAULT = '([^']+)'$", GOLDEN_BUILD.read_text(encoding="utf-8"), re.M)

        assert default, "golden_image_build.star should name the registry flisk up pulls from by default"
        assert default.group(1) == self._workflow_registries()[0]


def _starlark_closure(start: Path) -> set[Path]:
    """Every .star file that start loads, directly or through another load."""
    seen: set[Path] = set()
    todo = [start.resolve()]
    while todo:
        path = todo.pop()
        if path in seen:
            continue
        seen.add(path)
        for rel in re.findall(r"^load\(\s*['\"]([^'\"]+)['\"]", path.read_text(encoding="utf-8"), re.M):
            todo.append((path.parent / rel).resolve())
    return seen


class TestWorkflowPublishesEveryHash:
    """flisk up pulls the hash of its own engine, so main must publish each new golden Dockerfile without a manual run."""

    def test_runs_on_push_to_main_for_the_golden_dockerfile_sources(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        on = text[text.index("\non:") : text.index("\npermissions:")]

        assert re.search(r"^  push:\n    branches: \[main\]\n(?:    #.*\n)*    paths:", on, re.M)
        assert "workflow_dispatch:" in on
        paths = re.findall(r"^      - (\S+)$", on, re.M)
        for source in _starlark_closure(GOLDEN_BUILD.parent / "golden_image_dockerfile.star"):
            rel = source.relative_to(REPO_ROOT).as_posix()
            assert any(fnmatch.fnmatch(rel, glob) for glob in paths), (
                f"{rel} is loaded by the golden Dockerfile generator, so a change to it can change the hash; add it to the paths"
            )

    def test_skips_the_build_when_the_hash_is_already_published(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        check = text.index("golden-published.sh")
        push = text.index("push-golden-images.sh \"$RUNNER_TEMP/golden\"")

        assert check < push
        steps = text[check:].split("\n      - ")[1:]
        assert steps and all("if: steps.published.outputs.skip != 'true'" in step for step in steps)


@pytest.mark.skipif(os.name == "nt", reason="runs a POSIX shell script")
class TestGoldenPublished:
    """golden-published.sh tells the workflow whether every layer for this hash is already in the registry."""

    @staticmethod
    def _run(tmp_path: Path, missing: list[str]) -> tuple[subprocess.CompletedProcess, str]:
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        docker = bin_dir / "docker"
        docker.write_text(
            "#!/bin/sh\n"
            '[ "$1 $2" = "manifest inspect" ] || exit 2\n'
            'for m in $FAKE_MISSING; do case "$3" in */golden-$m:*) exit 1 ;; esac; done\n'
            "exit 0\n",
            encoding="utf-8",
        )
        docker.chmod(docker.stat().st_mode | stat.S_IXUSR)
        golden = tmp_path / "golden"
        golden.mkdir()
        dockerfile = golden / "golden-layers.Dockerfile"
        dockerfile.write_text("FROM scratch AS l1_golden\n", encoding="utf-8")
        env = {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}", "FAKE_MISSING": " ".join(missing)}
        result = subprocess.run(
            ["bash", str(PUBLISHED), str(golden), "ghcr.io/flisk-sh"], capture_output=True, text=True, env=env, check=False
        )
        return result, hashlib.sha256(dockerfile.read_bytes()).hexdigest()[:12]

    def test_all_layers_published(self, tmp_path):
        result, tag12 = self._run(tmp_path, [])

        assert result.returncode == 0, result.stdout + result.stderr
        assert f"all eight golden images for {tag12}" in result.stdout

    def test_one_missing_layer_means_publish(self, tmp_path):
        result, tag12 = self._run(tmp_path, ["l4-migrator"])

        assert result.returncode == 1
        assert result.stdout.strip() == f"missing: ghcr.io/flisk-sh/golden-l4-migrator:{tag12}"


def _load_verifier():
    import importlib.util

    spec = importlib.util.spec_from_file_location("verify_golden_images", REPO_ROOT / "scripts" / "golden" / "verify-golden-images.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestVerifyPublishedImages:
    """verify-golden-images.py check(): what the workflow asserts after the push."""

    HASH = "e5f25839a578" + "0" * 52
    REGISTRIES = ["ghcr.io/flisk-sh", "docker.io/alexdykyi"]

    def _observed(self):
        image = lambda layer: {"digest": f"sha256:{layer}", "sizes": {"amd64": 51_200_000, "arm64": 52_200_000}, "hash_label": self.HASH}
        return {registry: {layer: image(layer) for layer in LAYERS} for registry in self.REGISTRIES}

    def test_good_images_pass(self):
        assert _load_verifier().check(self._observed(), self.HASH) == []

    def test_an_almost_empty_image_fails(self):
        observed = self._observed()
        observed["ghcr.io/flisk-sh"]["l1"]["sizes"]["arm64"] = 2_000_000

        problems = _load_verifier().check(observed, self.HASH)

        assert len(problems) == 1
        assert "golden-l1:e5f25839a578: linux/arm64 is 2.0 MB" in problems[0]

    def test_an_oversized_image_fails(self):
        observed = self._observed()
        observed["docker.io/alexdykyi"]["l4-migrator"]["sizes"]["amd64"] = 900_000_000

        assert any("linux/amd64 is 900.0 MB" in p for p in _load_verifier().check(observed, self.HASH))

    def test_a_missing_platform_fails(self):
        observed = self._observed()
        del observed["ghcr.io/flisk-sh"]["l2"]["sizes"]["arm64"]

        assert _load_verifier().check(observed, self.HASH) == ["ghcr.io/flisk-sh/golden-l2:e5f25839a578: no linux/arm64 image"]

    def test_a_private_or_missing_package_fails(self):
        observed = self._observed()
        observed["ghcr.io/flisk-sh"]["l3-backend"] = {"error": "HTTP Error 403: Forbidden"}

        problems = _load_verifier().check(observed, self.HASH)

        assert problems == ["ghcr.io/flisk-sh/golden-l3-backend:e5f25839a578: cannot pull without a login (HTTP Error 403: Forbidden)"]

    def test_a_wrong_hash_label_fails(self):
        observed = self._observed()
        observed["ghcr.io/flisk-sh"]["l4-frontend"]["hash_label"] = None

        assert any("flisk.golden.hash label is None" in p for p in _load_verifier().check(observed, self.HASH))

    def test_different_images_in_the_two_registries_fail(self):
        observed = self._observed()
        observed["docker.io/alexdykyi"]["l1"]["digest"] = "sha256:other"

        assert any(p.startswith("golden-l1: registries hold different images") for p in _load_verifier().check(observed, self.HASH))

    def test_workflow_verifies_both_registries_after_the_push(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        push = text.index("push-golden-images.sh")
        verify = text.index("verify-golden-images.py")

        assert push < verify
        assert '"$GHCR_REGISTRY" "$DOCKERHUB_REGISTRY"' in text[verify:]
