#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Builds the eight golden targets from the rendered Dockerfile and pushes each as <registry>/golden-<layer>:<hash12>, labelled
# with the full hash the local build checks (flisk.golden.hash). Needs docker login and buildx.
set -euo pipefail
out="${1:?usage: push-golden-images.sh <dir-with-golden-layers.Dockerfile> <registry>}"
registry="${2:?registry, for example docker.io/flisk-sh}"
df="$out/golden-layers.Dockerfile"
hash="$(sha256sum "$df" | cut -c1-64)"
tag12="${hash:0:12}"
# layer key -> Dockerfile target, the same pairs GOLDEN_LAYERS uses in golden_image_constants.star.
targets=(
  "l1 l1_golden"
  "l2 l2_golden"
  "l3-backend l3_backend_golden"
  "l3-frontend l3_frontend_golden"
  "l4-backend l4_backend_bun"
  "l4-backend-node l4_backend_node"
  "l4-frontend l4_frontend_golden"
  "l4-migrator l4_migrator_golden"
)
root="$(cd "$(dirname "$0")/../.." && pwd)"
for pair in "${targets[@]}"; do
  target="${pair#* }"; key="${pair%% *}"
  ref="$registry/golden-$key:$tag12"
  echo "building $target -> $ref"
  docker buildx build --push --platform linux/amd64,linux/arm64 \
    --label "flisk.golden.hash=$hash" \
    -f "$df" --target "$target" -t "$ref" "$root"
done
echo "pushed the eight golden layers for hash $tag12 to $registry"
