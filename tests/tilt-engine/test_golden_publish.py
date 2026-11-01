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

import hashlib
import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PUSH = REPO_ROOT / "scripts" / "golden" / "push-golden-images.sh"
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

        assert suggested, "the golden docs should show how to set FLISK_GOLDEN_REGISTRY"
        assert set(suggested) <= set(self._workflow_registries())


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
