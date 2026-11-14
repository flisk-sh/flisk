#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Exit 0 when every golden layer for this Dockerfile's hash already has a valid signature in every registry given, checked with
# the same `cosign verify` that `flisk up` runs; exit 1 otherwise (the workflow then signs the existing digests).
set -uo pipefail
out="${1:?usage: golden-signed.sh <dir-with-golden-layers.Dockerfile> <registry> [<registry>...]}"
shift
[ "$#" -gt 0 ] || { echo "registry missing, for example ghcr.io/flisk-sh" >&2; exit 2; }
tag12="$(sha256sum "$out/golden-layers.Dockerfile" | cut -c1-12)"
for layer in l1 l2 l3-backend l3-frontend l4-backend l4-backend-node l4-frontend l4-migrator; do
  for registry in "$@"; do
    cosign verify \
      --certificate-identity-regexp 'https://github.com/flisk-sh/flisk/.github/workflows/publish-golden-images.yml@.*' \
      --certificate-oidc-issuer https://token.actions.githubusercontent.com \
      "$registry/golden-$layer:$tag12" >/dev/null 2>&1 || { echo "golden-$layer:$tag12 is not signed in $registry" >&2; exit 1; }
  done
done
echo "every golden layer for $tag12 is signed"
