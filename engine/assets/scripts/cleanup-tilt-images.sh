#!/bin/bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT

set -euo pipefail

# Keep the newest N Tilt-tagged images per repository.
# Defaults to a safe dry-run unless --force is provided.

KEEP_COUNT=0
FORCE=0

usage() {
  cat <<USAGE
Usage: $0 [--keep N] [--force]

Options:
  --keep N   Number of newest tilt-* images to keep per repository (default: 0)
  --force    Actually remove images. Without this, runs in dry-run mode.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep)
      KEEP_COUNT="${2:-}"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if ! [[ "$KEEP_COUNT" =~ ^[0-9]+$ ]] || [[ "$KEEP_COUNT" -lt 0 ]]; then
  echo "--keep must be an integer >= 0"
  exit 1
fi

echo "Scanning Tilt images (tag starts with tilt-) ..."

# Format: REPO TAG IMAGE_ID CREATED_AT
# Sort newest-first by creation time so first N are retained.
IMAGES_RAW="$(
  docker image ls --format '{{.Repository}} {{.Tag}} {{.ID}} {{.CreatedAt}}' \
  | awk '$2 ~ /^tilt-/' \
  | sort -rk4,5
)"

if [[ -z "${IMAGES_RAW}" ]]; then
  echo "No tilt-* images found."
  exit 0
fi

TO_DELETE=()

echo "Retention policy: keep newest $KEEP_COUNT tilt-* images per repository"

REPOS="$(printf '%s\n' "$IMAGES_RAW" | awk '{print $1}' | sort -u)"
for repo in $REPOS; do
  repo_blob="$(printf '%s\n' "$IMAGES_RAW" | awk -v r="$repo" '$1==r')"
  total=$(printf '%s\n' "$repo_blob" | awk 'NF{c++} END{print c+0}')
  echo "- $repo: $total tilt image(s)"

  if (( total <= KEEP_COUNT )); then
    continue
  fi

  # Delete rows after KEEP_COUNT newest.
  i=0
  while IFS= read -r row; do
    [[ -z "$row" ]] && continue
    if (( i < KEEP_COUNT )); then
      ((++i))
      continue
    fi
    image_id="$(awk '{print $3}' <<< "$row")"
    tag="$(awk '{print $2}' <<< "$row")"
    TO_DELETE+=("$image_id|$repo:$tag")
    ((++i))
  done <<< "$repo_blob"
done

if [[ ${#TO_DELETE[@]} -eq 0 ]]; then
  echo "Nothing to remove."
  exit 0
fi

echo
echo "Images selected for cleanup: ${#TO_DELETE[@]}"
for item in "${TO_DELETE[@]}"; do
  IFS='|' read -r image_id ref <<< "$item"
  echo "  $ref ($image_id)"
done

echo
if [[ "$FORCE" -ne 1 ]]; then
  echo "Dry-run only. Re-run with --force to remove these images."
  exit 0
fi

echo "Removing old tilt images..."
for item in "${TO_DELETE[@]}"; do
  IFS='|' read -r image_id ref <<< "$item"
  if docker rmi "$image_id" >/dev/null 2>&1; then
    echo "  removed $ref ($image_id)"
  else
    echo "  skipped $ref ($image_id) - likely in use"
  fi
done

echo "Cleanup complete."
