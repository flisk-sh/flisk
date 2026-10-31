#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Writes golden-layers.Dockerfile, exactly as `flisk up` generates it, into <out-dir>. The generator is the repository's own
# Starlark (runtime/engine/topologies/platform/docker/build), run through Tilt, so the hash matches what a project computes.
set -euo pipefail
out="${1:?usage: render-golden-dockerfile.sh <out-dir>}"
mkdir -p "$out"
root="$(cd "$(dirname "$0")/../.." && pwd)"
tiltfile="$out/Tiltfile"
cat > "$tiltfile" <<TILT
load('$root/runtime/engine/topologies/platform/docker/build/golden_image_dockerfile.star', 'generate_golden_dockerfile')
local("cat > '$out/golden-layers.Dockerfile'", quiet = True, stdin = generate_golden_dockerfile())
TILT
FLISK_PROJECT_ROOT="$out" tilt alpha tiltfile-result -f "$tiltfile" >/dev/null 2>&1 || true
test -s "$out/golden-layers.Dockerfile" || { echo "::error::the golden Dockerfile was not rendered"; exit 1; }
echo "rendered $out/golden-layers.Dockerfile, sha256 $(sha256sum "$out/golden-layers.Dockerfile" | cut -c1-64)"
