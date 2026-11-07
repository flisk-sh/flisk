#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Exits 0 when <registry> already holds all eight golden-<layer>:<hash12> images for the rendered Dockerfile in <dir>, and 1
# when any is missing (prints which). publish-golden-images.yml runs on every push to main that can change the golden
# Dockerfile and uses this to skip a hash that is already published. Reads the registry without a login, the way
# `flisk up` pulls.
set -euo pipefail
out="${1:?usage: golden-published.sh <dir-with-golden-layers.Dockerfile> <registry>}"
registry="${2:?registry missing, for example ghcr.io/flisk-sh}"
hash="$( (sha256sum "$out/golden-layers.Dockerfile" 2>/dev/null || shasum -a 256 "$out/golden-layers.Dockerfile") | cut -c1-64)"
tag12="${hash:0:12}"
missing=0
for key in l1 l2 l3-backend l3-frontend l4-backend l4-backend-node l4-frontend l4-migrator; do
  if ! docker manifest inspect "$registry/golden-$key:$tag12" >/dev/null 2>&1; then
    echo "missing: $registry/golden-$key:$tag12"
    missing=1
  fi
done
[ "$missing" = 0 ] && echo "all eight golden images for $tag12 are in $registry"
exit "$missing"
