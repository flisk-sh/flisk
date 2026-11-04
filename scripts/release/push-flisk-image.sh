#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Builds the flisk CLI image (scripts/release/flisk-image.Dockerfile) from a release's assets and pushes it for linux/amd64 and
# linux/arm64 as <registry>/flisk:<version>, plus :latest with --latest. The image is built once and tagged in every registry
# given, so all registries hold the same digest, which it prints on its last line (and writes to $GITHUB_OUTPUT as `digest`).
# --load builds only this machine's platform into the local Docker as flisk:<version> and pushes nothing (the dry run).
# Needs buildx and jq, and docker login to each registry unless --load.
#
#   push-flisk-image.sh <dir with flisk-linux-amd64, flisk-linux-arm64, flisk-cli-engine.tar.gz> <version> [--latest] [--load] <registry>...
set -euo pipefail
assets="${1:?usage: push-flisk-image.sh <assets-dir> <version> [--latest] [--load] <registry>...}"
version="${2:?version missing, for example 1.4.28}"
shift 2
latest=false load=false registries=()
for arg in "$@"; do
  case "$arg" in
    --latest) latest=true ;;
    --load) load=true ;;
    *) registries+=("$arg") ;;
  esac
done
[ "$load" = true ] || [ "${#registries[@]}" -gt 0 ] || { echo "registry missing, for example ghcr.io/flisk-sh" >&2; exit 2; }
for f in flisk-linux-amd64 flisk-linux-arm64 flisk-cli-engine.tar.gz; do
  [ -s "$assets/$f" ] || { echo "$assets/$f is missing" >&2; exit 1; }
done
root="$(cd "$(dirname "$0")/../.." && pwd)"
source_url="https://github.com/flisk-sh/flisk"
description="The flisk CLI with Docker, Compose and Tilt; mount /var/run/docker.sock and the project at the same path"
# The context holds only the three assets, so nothing else from the release directory (or the repository) ends up in the image.
context="$(mktemp -d)"
trap 'rm -rf "$context"' EXIT
cp "$assets/flisk-linux-amd64" "$assets/flisk-linux-arm64" "$assets/flisk-cli-engine.tar.gz" "$context/"

tags=()
if [ "$load" = true ]; then
  tags=(-t "flisk:$version")
else
  for registry in "${registries[@]}"; do
    tags+=(-t "$registry/flisk:$version")
    [ "$latest" = false ] || tags+=(-t "$registry/flisk:latest")
  done
fi
# The index annotations only exist on a multi-platform push; a --load image has no index.
# shellcheck disable=SC2054 # the comma is buildx's platform list
output=(--push --platform linux/amd64,linux/arm64
  --annotation "index:org.opencontainers.image.source=$source_url"
  --annotation "index:org.opencontainers.image.description=$description"
  --annotation "index:org.opencontainers.image.licenses=MIT")
[ "$load" = false ] || output=(--load)
metadata="$context/metadata.json"
echo "building flisk $version -> ${tags[*]}"
# GHCR links a package to its repository by the source label (the index annotation for a multi-platform image).
docker buildx build "${output[@]}" --metadata-file "$metadata" \
  --build-arg "VERSION=$version" \
  --label "org.opencontainers.image.source=$source_url" \
  --label "org.opencontainers.image.description=$description" \
  --label "org.opencontainers.image.licenses=MIT" \
  -f "$root/scripts/release/flisk-image.Dockerfile" "${tags[@]}" "$context"
digest="$(jq -r '."containerimage.digest" // ""' "$metadata")"
[ -n "$digest" ] || { echo "buildx reported no image digest" >&2; exit 1; }
[ -z "${GITHUB_OUTPUT:-}" ] || echo "digest=$digest" >>"$GITHUB_OUTPUT"
echo "$digest"
