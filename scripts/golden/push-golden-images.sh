#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Builds the eight golden targets from the rendered Dockerfile and pushes each as <registry>/golden-<layer>:<hash12>, labelled
# with the full hash the local build checks (flisk.golden.hash). Each target is built once and tagged in every registry given,
# so all registries hold the same image. Needs docker login to each registry and buildx.
set -euo pipefail
out="${1:?usage: push-golden-images.sh <dir-with-golden-layers.Dockerfile> <registry> [<registry>...]}"
shift
[ "$#" -gt 0 ] || { echo "registry missing, for example ghcr.io/flisk-sh" >&2; exit 2; }
registries=("$@")
df="$out/golden-layers.Dockerfile"
hash="$(sha256sum "$df" | cut -c1-64)"
tag12="${hash:0:12}"
source_url="https://github.com/flisk-sh/flisk"
description="Flisk golden base layer, pulled by flisk up when FLISK_GOLDEN_REGISTRY is set"
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
  tags=()
  for registry in "${registries[@]}"; do tags+=(-t "$registry/golden-$key:$tag12"); done
  echo "building $target -> golden-$key:$tag12 in ${registries[*]}"
  # GHCR links a package to its repository by the source label (index annotation for a multi-platform image).
  docker buildx build --push --platform linux/amd64,linux/arm64 \
    --label "flisk.golden.hash=$hash" \
    --label "org.opencontainers.image.source=$source_url" \
    --label "org.opencontainers.image.description=$description" \
    --label "org.opencontainers.image.licenses=MIT" \
    --annotation "index:org.opencontainers.image.source=$source_url" \
    --annotation "index:org.opencontainers.image.description=$description" \
    -f "$df" --target "$target" "${tags[@]}" "$root"
done
echo "pushed the eight golden layers for hash $tag12 to ${registries[*]}"
