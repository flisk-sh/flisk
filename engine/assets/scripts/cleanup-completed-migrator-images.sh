#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
set -euo pipefail

# Delete images for completed DB migrator containers to free disk space.
# Safe guards:
# - only containers with names ending in -db-migrator are considered
# - only exited containers with exit code 0 are processed
# - image deletion is best-effort (skips if still in use)

mapfile -t migrator_containers < <(
  docker ps -a --format '{{.Names}}' | grep -E -- '-db-migrator($|-)' 2>/dev/null || true
)

if [ "${#migrator_containers[@]}" -eq 0 ]; then
  exit 0
fi

for name in "${migrator_containers[@]}"; do
  state="$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || true)"
  exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$name" 2>/dev/null || true)"

  if [ "$state" != "exited" ] || [ "$exit_code" != "0" ]; then
    continue
  fi

  image_ref="$(docker inspect -f '{{.Config.Image}}' "$name" 2>/dev/null || true)"
  if [ -z "$image_ref" ]; then
    continue
  fi

  # Remove the stopped migrator container so image can be deleted if unused.
  docker rm "$name" >/dev/null 2>&1 || true

  if docker image rm "$image_ref" >/dev/null 2>&1; then
    echo "$(date +%H:%M:%S) pruned migrator image: $image_ref"
  fi
done
