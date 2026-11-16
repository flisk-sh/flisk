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
  ids=$(host images -q --no-trunc) || rc=1
  if [ "$rc" -eq 0 ]; then
    for id in $(printf '%s\n' "$ids" | sort -u); do
      on_kiri image inspect "$id" >/dev/null 2>&1 && continue
      tags=$(host image inspect --format '{{range .RepoTags}}{{.}} {{end}}' "$id") || { rc=1; break; }
      case "$tags" in *flisk* | *golden* | *bench*) ;; *) continue ;; esac
      tar="${TMPDIR:-/tmp}/kiri-shim-$$.tar"
      # shellcheck disable=SC2086 # tags are space separated image names
      host save -o "$tar" $tags && on_kiri load -q -i "$tar" >&2 || rc=1
      rm -f "$tar"
      [ "$rc" -eq 0 ] || break
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
  pull | tag)
    # base images the builds start from must exist on both engines
    host "$@" >/dev/null 2>&1 || true
    exec env DOCKER_HOST="$kiri" "$real" "$@"
    ;;
  *) exec env DOCKER_HOST="$kiri" "$real" "$@" ;;
esac
