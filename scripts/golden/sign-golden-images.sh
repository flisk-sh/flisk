#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Signs each pushed golden image BY DIGEST with cosign (keyless: the workflow's GitHub OIDC identity), in every registry given,
# and prints "<layer>=<digest>" lines for the provenance attestation steps (append them to $GITHUB_OUTPUT). The signature is what
# `flisk up` checks with `cosign verify` against this publish workflow's identity. Needs cosign, docker login to each registry,
# and `id-token: write`.
set -euo pipefail
out="${1:?usage: sign-golden-images.sh <dir-with-golden-layers.Dockerfile> <registry> [<registry>...]}"
shift
[ "$#" -gt 0 ] || { echo "registry missing, for example ghcr.io/flisk-sh" >&2; exit 2; }
registries=("$@")
hash="$(sha256sum "$out/golden-layers.Dockerfile" | cut -c1-64)"
tag12="${hash:0:12}"
layers=(l1 l2 l3-backend l3-frontend l4-backend l4-backend-node l4-frontend l4-migrator)
for layer in "${layers[@]}"; do
  digest="$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "${registries[0]}/golden-$layer:$tag12")"
  case "$digest" in sha256:*) ;; *) echo "no digest for golden-$layer:$tag12: '$digest'" >&2; exit 1 ;; esac
  for registry in "${registries[@]}"; do
    echo "signing $registry/golden-$layer@$digest" >&2
    cosign sign --yes "$registry/golden-$layer@$digest" >&2
  done
  echo "$layer=$digest"
done
