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

from __future__ import annotations

import fnmatch
import json
import shutil
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
        building = [step for step in steps if re.search(r"setup-qemu|setup-buildx|push-golden-images\.sh|verify-golden-images\.py", step)]
        assert len(building) == 4
        assert all("if: steps.published.outputs.skip != 'true'\n" in step for step in building)

    def test_an_already_published_hash_is_still_checked_for_a_signature(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        steps = text[text.index("golden-published.sh"):].split("\n      - ")[1:]
        looks = next(step for step in steps if "golden-signed.sh" in step)
        signing = [step for step in steps if re.search(r"sign-golden-images\.sh|attest-build-provenance|Verify the golden image signatures", step)]

        assert "if: steps.published.outputs.skip == 'true'" in looks
        assert len(signing) == len(LAYERS) + 2  # sign, one attestation per layer, read-back
        assert all("steps.published.outputs.skip != 'true' || steps.signed.outputs.signed != 'true'" in step for step in signing)
        # Signing pushes signatures, so the logins and cosign cannot wait for a build.
        for step in steps:
            if "docker/login-action" in step or "cosign-installer" in step:
                assert "if:" not in step


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
        measured = json.loads((REPO_ROOT / "scripts" / "golden" / "size-budgets.json").read_text())["measured_bytes"]
        image = lambda layer: {"digest": f"sha256:{layer}", "sizes": {"amd64": measured[layer], "arm64": measured[layer]}, "hash_label": self.HASH}
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

    def test_growth_over_ten_percent_in_one_layer_fails_even_below_the_old_400_mb_cap(self):
        budgets = json.loads((REPO_ROOT / "scripts" / "golden" / "size-budgets.json").read_text())
        observed = self._observed()
        grown = int(budgets["measured_bytes"]["l4-migrator"] * 1.15)
        observed["ghcr.io/flisk-sh"]["l4-migrator"]["sizes"]["arm64"] = grown

        problems = _load_verifier().check(observed, self.HASH)

        assert len(problems) == 1 and "golden-l4-migrator" in problems[0] and "size-budgets.json" in problems[0]

    def test_every_layer_has_a_budget_above_its_measured_size_by_about_ten_percent(self):
        budgets = json.loads((REPO_ROOT / "scripts" / "golden" / "size-budgets.json").read_text())
        assert set(budgets["budget_bytes"]) == set(LAYERS) == set(budgets["measured_bytes"])
        for layer in LAYERS:
            ratio = budgets["budget_bytes"][layer] / budgets["measured_bytes"][layer]
            assert 1.09 <= ratio <= 1.12, (layer, ratio)

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


SIGN = REPO_ROOT / "scripts" / "golden" / "sign-golden-images.sh"
IDENTITY = "https://github.com/flisk-sh/flisk/.github/workflows/publish-golden-images.yml@.*"
ISSUER = "https://token.actions.githubusercontent.com"


class TestWorkflowSignsEveryImage:
    """The publish workflow signs by digest (keyless) and attests provenance, with the permissions at job level only."""

    TEXT = WORKFLOW.read_text(encoding="utf-8")

    def test_signing_comes_after_the_push_and_uses_a_pinned_installer(self):
        push = self.TEXT.index("push-golden-images.sh")
        sign = self.TEXT.index("sign-golden-images.sh")

        assert push < sign
        assert re.search(r"sigstore/cosign-installer@[0-9a-f]{40} # v", self.TEXT)

    def test_every_layer_gets_a_pinned_provenance_attestation_pushed_to_the_registry(self):
        for layer in LAYERS:
            assert f"subject-digest: ${{{{ steps.sign.outputs.{layer} }}}}" in self.TEXT
            assert f"subject-name: ${{{{ env.GHCR_REGISTRY }}}}/golden-{layer}\n" in self.TEXT
        assert len(re.findall(r"actions/attest-build-provenance@[0-9a-f]{40} # v", self.TEXT)) == len(LAYERS)
        assert self.TEXT.count("push-to-registry: true") == len(LAYERS)

    def test_oidc_and_attestation_permissions_are_on_the_job_not_the_workflow(self):
        top, job = self.TEXT.split("\njobs:\n", 1)

        assert "id-token" not in top and "attestations" not in top
        assert re.search(r"^\s+id-token: write\b", job, re.M)
        assert re.search(r"^\s+attestations: write\b", job, re.M)

    def test_the_workflow_reads_the_signatures_back_with_the_pull_side_check(self):
        assert f"--certificate-identity-regexp '{IDENTITY}'" in self.TEXT
        assert f"--certificate-oidc-issuer {ISSUER}" in self.TEXT


@pytest.mark.skipif(os.name == "nt", reason="runs a POSIX shell script")
class TestSignScript:
    def test_signs_each_layer_by_digest_in_every_registry(self, tmp_path):
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        log = tmp_path / "log"
        (bin_dir / "docker").write_text("#!/bin/bash\necho sha256:" + "a" * 64 + "\n", encoding="utf-8")
        (bin_dir / "cosign").write_text(f'#!/bin/bash\necho "$@" >> "{log}"\n', encoding="utf-8")
        for tool in ("docker", "cosign"):
            (bin_dir / tool).chmod(0o755)
        golden = tmp_path / "golden"
        golden.mkdir()
        (golden / "golden-layers.Dockerfile").write_text("FROM scratch\n", encoding="utf-8")
        env = {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}

        result = subprocess.run(["bash", str(SIGN), str(golden), "ghcr.io/x", "docker.io/y"], capture_output=True, text=True, env=env, check=False)

        assert result.returncode == 0, result.stderr
        assert result.stdout.splitlines() == [f"{layer}=sha256:{'a' * 64}" for layer in LAYERS]
        calls = log.read_text(encoding="utf-8").splitlines()
        assert len(calls) == 2 * len(LAYERS)
        assert calls[0] == f"sign --yes ghcr.io/x/golden-l1@sha256:{'a' * 64}"
        assert all("@sha256:" in call for call in calls)


@pytest.mark.skipif(
    os.name == "nt" or shutil.which("tilt") is None, reason="renders the pull script with Tilt and runs it in a POSIX shell"
)
class TestPullVerifiesSignature:
    """The generated golden pull script runs `cosign verify` when cosign is present, and FLISK_GOLDEN_VERIFY=require needs it."""

    FALLBACK = "building them here"

    @pytest.fixture(scope="class")
    def script(self, tmp_path_factory):
        work = tmp_path_factory.mktemp("render")
        (work / "Tiltfile").write_text(
            f"load('{GOLDEN_BUILD}', 'build_golden_layers')\nbuild_golden_layers('.')\n", encoding="utf-8"
        )
        proc = subprocess.run(
            ["tilt", "alpha", "tiltfile-result", "-f", "Tiltfile"], capture_output=True, text=True, cwd=work, timeout=180, check=False
        )
        manifests = json.loads(proc.stdout)["Manifests"]
        return manifests[0]["DeployTarget"]["UpdateCmdSpec"]["args"][2]

    @staticmethod
    def _run(tmp_path: Path, script: str, cosign: str | None, **env_extra: str):
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        log = tmp_path / "log"
        # Fake docker: pull and tag work, no image carries a hash label (so nothing counts as built), the build always fails.
        (bin_dir / "docker").write_text(
            "#!/bin/bash\n"
            f'echo "docker $*" >> "{log}"\n'
            'case "$1 $2" in\n'
            '  "image inspect") case "$*" in *RepoDigests*) echo "ghcr.io/flisk-sh/golden-l1@sha256:abc" ;; esac; exit 0 ;;\n'
            '  "buildx version") exit 1 ;;\n'
            '  "build "*|"build -"*) exit 1 ;;\n'
            "esac\n"
            'case "$1" in build) exit 1 ;; esac\n'
            "exit 0\n",
            encoding="utf-8",
        )
        (bin_dir / "docker").chmod(0o755)
        if cosign is not None:
            (bin_dir / "cosign").write_text(f'#!/bin/bash\necho "cosign $*" >> "{log}"\nexit {cosign}\n', encoding="utf-8")
            (bin_dir / "cosign").chmod(0o755)
        project = tmp_path / "project"
        (project / ".flisk" / ".flisk-out").mkdir(parents=True)
        (project / ".flisk" / ".flisk-out" / "golden-layers.Dockerfile").write_text("FROM scratch\n", encoding="utf-8")
        # PATH holds only the fakes and the system essentials, so a cosign on the developer's machine is never found.
        env = {"PATH": f"{bin_dir}:/usr/bin:/bin", "HOME": str(tmp_path), **env_extra}
        result = subprocess.run(["sh", "-c", script], capture_output=True, text=True, cwd=project, env=env, check=False)
        calls = log.read_text(encoding="utf-8").splitlines() if log.exists() else []
        return result.stdout + result.stderr, calls, result.returncode

    def test_cosign_present_and_verify_passes_keeps_the_pulled_images(self, tmp_path, script):
        out, calls, code = self._run(tmp_path, script, cosign="0")

        assert code == 0, out
        assert "Golden images pulled from ghcr.io/flisk-sh" in out
        verifies = [c for c in calls if c.startswith("cosign verify")]
        assert len(verifies) == len(LAYERS)
        assert f"--certificate-identity-regexp {IDENTITY} --certificate-oidc-issuer {ISSUER}" in verifies[0]
        assert verifies[0].endswith("ghcr.io/flisk-sh/golden-l1@sha256:abc")  # by digest, not by the movable tag

    def test_cosign_present_and_verify_fails_discards_the_image_and_builds_locally(self, tmp_path, script):
        out, calls, _ = self._run(tmp_path, script, cosign="1")

        assert "Signature check failed for ghcr.io/flisk-sh/golden-l1:" in out
        assert self.FALLBACK in out
        assert "Golden images pulled" not in out
        assert sum(c.startswith("cosign verify") for c in calls) == 1  # the remaining layers are not tried
        assert any(c.startswith("docker image rm ghcr.io/flisk-sh/golden-l1:") for c in calls)
        assert not any(c.startswith("docker tag ") for c in calls)  # nothing was tagged as the project's image

    def test_no_cosign_behaves_as_before(self, tmp_path, script):
        out, calls, code = self._run(tmp_path, script, cosign=None)

        assert code == 0, out
        assert "Golden images pulled from ghcr.io/flisk-sh" in out
        assert not any(c.startswith("cosign") for c in calls)

    def test_no_cosign_with_require_builds_locally(self, tmp_path, script):
        out, calls, _ = self._run(tmp_path, script, cosign=None, FLISK_GOLDEN_VERIFY="require")

        assert "FLISK_GOLDEN_VERIFY=require but cosign is not installed" in out
        assert self.FALLBACK in out
        assert not any(c.startswith("docker tag ") for c in calls)

    def test_require_with_a_passing_cosign_still_uses_the_pull(self, tmp_path, script):
        out, _, code = self._run(tmp_path, script, cosign="0", FLISK_GOLDEN_VERIFY="require")

        assert code == 0, out
        assert "Golden images pulled from ghcr.io/flisk-sh" in out

    def test_windows_script_carries_the_same_check(self):
        windows = (REPO_ROOT / "runtime" / "engine" / "topologies" / "tilt" / "common" / "windows_scripts.star").read_text(encoding="utf-8")

        assert "cosign verify --certificate-identity-regexp $cfg.signer_identity --certificate-oidc-issuer $cfg.signer_issuer" in windows
        assert "FLISK_GOLDEN_VERIFY" in windows


GOLDEN_SIGNED = REPO_ROOT / "scripts" / "golden" / "golden-signed.sh"


@pytest.mark.skipif(os.name == "nt", reason="runs a POSIX shell script")
class TestExistingHashSigning:
    """golden-signed.sh decides between "skip entirely" (signed) and "sign only" (exists, unsigned)."""

    @staticmethod
    def _run(tmp_path: Path, cosign_exit: int):
        bin_dir = tmp_path / "bin"
        bin_dir.mkdir()
        (bin_dir / "cosign").write_text(f"#!/bin/bash\nexit {cosign_exit}\n", encoding="utf-8")
        (bin_dir / "cosign").chmod(0o755)
        golden = tmp_path / "golden"
        golden.mkdir()
        (golden / "golden-layers.Dockerfile").write_text("FROM scratch\n", encoding="utf-8")
        env = {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
        return subprocess.run(["bash", str(GOLDEN_SIGNED), str(golden), "ghcr.io/x", "docker.io/y"], capture_output=True, text=True, env=env, check=False)

    def test_signed_hash_is_skipped_entirely(self, tmp_path):
        assert self._run(tmp_path, 0).returncode == 0

    def test_existing_unsigned_hash_asks_for_signing_only(self, tmp_path):
        result = self._run(tmp_path, 1)

        assert result.returncode == 1
        assert "is not signed in ghcr.io/x" in result.stderr
