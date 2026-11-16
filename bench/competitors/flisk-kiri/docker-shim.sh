#!/bin/sh
# Bench-only `docker` stand-in for the Flisk-on-Kiri lane. Kiri 0.2.1 has no DNS in RUN steps, so a build run on Kiri
# cannot download anything. `docker build` and `docker buildx ...` run on the runner's own Docker instead, and every
# image they left behind is copied into Kiri; `pull` and `tag` run on both; every other command goes to Kiri. Needs SHIM_REAL_DOCKER and SHIM_KIRI_HOST.
real="${SHIM_REAL_DOCKER:?}"
kiri="${SHIM_KIRI_HOST:?}"
host() { env -u DOCKER_HOST -u DOCKER_CONTEXT DOCKER_BUILDKIT=1 "$real" "$@"; }
on_kiri() { DOCKER_HOST="$kiri" "$real" "$@"; }
# one sync at a time (Tilt builds in parallel and Kiri's loader fails on concurrent loads); only images the stack
# itself builds or pulls (flisk / golden / bench names), not the runner's own images
sync() {
  lock="${TMPDIR:-/tmp}/flisk-kiri-sync.lock"
  until mkdir "$lock" 2>/dev/null; do sleep 0.5; done
  rc=0
  refs=$(host images --format '{{.Repository}}:{{.Tag}}') || rc=1
  missing=""
  if [ "$rc" -eq 0 ]; then
    for ref in $(printf '%s\n' "$refs" | sort -u); do
      case "$ref" in *flisk* | *golden* | *bench*) ;; *) continue ;; esac
      case "$ref" in *'<none>'*) continue ;; esac
      # by tag, not by id: two services can build the same image id under different tags
      on_kiri image inspect "$ref" >/dev/null 2>&1 && continue
      missing="$missing $ref"
    done
  fi
  if [ "$rc" -eq 0 ] && [ -n "$missing" ]; then
    tar="${TMPDIR:-/tmp}/kiri-shim-$$.tar"
    # shellcheck disable=SC2086 # refs are space separated image names
    host save -o "$tar" $missing && on_kiri load -q -i "$tar" >&2 || rc=1
    rm -f "$tar"
    # Kiri's loader drops a tag when an image with the same id is already there: tag what is still missing by id
    for ref in $missing; do
      on_kiri image inspect "$ref" >/dev/null 2>&1 && continue
      id=$(host image inspect --format '{{.Id}}' "$ref") || { rc=1; continue; }
      on_kiri tag "$id" "$ref" || rc=1
    done
  fi
  rmdir "$lock" 2>/dev/null
  return "$rc"
}
# the compose sub-command: the first word that is not a global option or an option's value
compose_sub() {
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --project-name | -p | --project-directory | --env-file | -f | --file | --profile | --ansi | --progress | --parallel | --context | --host | -H) shift 2 ;;
      -*) shift ;;
      *) echo "$1"; return ;;
    esac
  done
}
case "${1:-}" in
  build | buildx)
    host "$@"
    rc=$?
    [ "$rc" -eq 0 ] || exit "$rc"
    sync || exit 1
    exit 0
    ;;
  compose)
    if [ "$(compose_sub "$@")" = build ]; then
      host "$@"
      rc=$?
      [ "$rc" -eq 0 ] || exit "$rc"
      sync || exit 1
      exit 0
    fi
    exec env DOCKER_HOST="$kiri" "$real" "$@"
    ;;
  tag)
    # Tilt looks the tilt-* tag up on Kiri: make sure the source image is there before tagging it on both
    host "$@" >/dev/null 2>&1 || true
    sync >&2 || true
    exec env DOCKER_HOST="$kiri" "$real" "$@"
    ;;
  pull)
    # base images the builds start from must exist on both engines
    host "$@" >/dev/null 2>&1 || true
    exec env DOCKER_HOST="$kiri" "$real" "$@"
    ;;
  *) exec env DOCKER_HOST="$kiri" "$real" "$@" ;;
esac
