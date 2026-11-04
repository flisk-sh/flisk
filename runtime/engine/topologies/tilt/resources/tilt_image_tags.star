# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🏷️ TILT SDK - TILT IMAGE TAGS
# =============================================================================
# Tilt builds every app image as <name>:tilt-<hash>, tags it with the :dev ref the
# compose service declares, and from then on uses only :dev (tilt-dev/tilt
# internal/controllers/core/dockerimage/imagemap.go: tagWithExpected, then
# NewImageBuildResultSingleRef). The tilt-* tag stays behind: `docker images` lists
# every service twice, and after a rebuild the previous build keeps its tilt-* tag,
# so a full old image per service stays on disk until Tilt's own prune.
#
# This resource removes the project's tilt-* tags: at start, and whenever an image
# of the project is tagged :dev. A tilt-* tag goes when it points at the :dev image
# (an alias) or at an image created before it (an old build). A newer one is a
# build Tilt has not tagged :dev yet and is left alone. An old build still used by
# the container compose is about to replace is retried after a container is removed.
#
# Keep the tags with FLISK_KEEP_TILT_TAGS=1.
# =============================================================================

RESOURCE_NAME = 'tilt-image-tags'

# $1: the repository prefix of this project's images (<project>_). Logs one line per removed tag.
TILT_IMAGE_TAGS_SCRIPT = r'''
prefix="$1"
pending=""

# An image's Created time (RFC 3339, in the daemon's local offset or Z) as seconds since the epoch: GNU date, then BSD
# date. Prints nothing when neither can read it.
epoch() {
  t=$(printf '%s' "$1" | sed -E 's/\.[0-9]+//; s/Z$/+00:00/')
  date -d "$t" +%s 2>/dev/null ||
    date -j -f '%Y-%m-%dT%H:%M:%S%z' "$(printf '%s' "$t" | sed -E 's/([+-][0-9]{2}):([0-9]{2})$/\1\2/')" +%s 2>/dev/null
}

# Removes the tilt-* tags of one image name that are older than, or the same image as, its :dev tag.
clean() {
  repo="$1"
  dev=$(docker image inspect -f '{{.Id}} {{.Created}}' "$repo:dev" 2>/dev/null) || return 0
  dev_id=${dev%% *}
  dev_at=$(epoch "${dev#* }")
  for ref in $(docker image ls --format '{{.Repository}}:{{.Tag}}' "$repo" 2>/dev/null); do
    case "$ref" in "$repo":tilt-*) ;; *) continue ;; esac
    img=$(docker image inspect -f '{{.Id}} {{.Created}}' "$ref" 2>/dev/null) || continue
    img_id=${img%% *}
    if [ "$img_id" != "$dev_id" ]; then
      img_at=$(epoch "${img#* }")
      [ -n "$img_at" ] && [ -n "$dev_at" ] && [ "$img_at" -lt "$dev_at" ] || continue
    fi
    if docker image rm "$ref" >/dev/null 2>&1; then
      echo "removed $ref"
    elif docker image inspect "$ref" >/dev/null 2>&1; then
      case " $pending " in *" $repo "*) ;; *) pending="$pending $repo" ;; esac
    fi
  done
}

since=$(date +%s)
for ref in $(docker image ls --format '{{.Repository}}:{{.Tag}}' 2>/dev/null); do
  case "$ref" in "$prefix"*:dev) clean "${ref%:dev}" ;; esac
done

docker events --since "$since" \
  --filter type=image --filter event=tag \
  --filter type=container --filter event=destroy \
  --format '{{.Type}} {{.Action}} {{.Actor.Attributes.name}}' |
while read -r type action name; do
  if [ "$type $action" = "image tag" ]; then
    case "$name" in "$prefix"*:dev) clean "${name%:dev}" ;; esac
  elif [ "$type $action" = "container destroy" ] && [ -n "$pending" ]; then
    retry="$pending"
    pending=""
    for repo in $retry; do clean "$repo"; done
  fi
done
'''


def register_tilt_image_tags(repo_prefix):
    """Adds the serve-only local resource that removes this project's tilt-* image tags. Call at Tiltfile load.

    repo_prefix: the start of every app image name of this project (PROJECT_NAME + '_', see
    platform/docker/constants.star app_image_name and migrator_image_name).
    """
    if os.environ.get('FLISK_KEEP_TILT_TAGS', '').strip() == '1':
        return None
    local_resource(
        RESOURCE_NAME,
        serve_cmd=['sh', '-c', TILT_IMAGE_TAGS_SCRIPT, 'sh', repo_prefix],
        labels=['infra.docker'],
        auto_init=True,
    )
    return RESOURCE_NAME
