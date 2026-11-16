#!/bin/sh
# Bench-only `docker` stand-in for the Flisk-on-Kiri lane. Kiri 0.2.1 has no DNS in RUN steps, so a build run on Kiri
# cannot download anything. `docker build` and `docker buildx ...` run on the runner's own Docker instead, and every
# image they left behind is copied into Kiri; `pull` and `tag` run on both; every other command goes to Kiri. Needs SHIM_REAL_DOCKER and SHIM_KIRI_HOST.
real="${SHIM_REAL_DOCKER:?}"
kiri="${SHIM_KIRI_HOST:?}"
host() { env -u DOCKER_HOST -u DOCKER_CONTEXT "$real" "$@"; }
on_kiri() { DOCKER_HOST="$kiri" "$real" "$@"; }
case "${1:-}" in
  build | buildx)
    host "$@"
    rc=$?
    [ "$rc" -eq 0 ] || exit "$rc"
    for id in $(host images -q --no-trunc | sort -u); do
      on_kiri image inspect "$id" >/dev/null 2>&1 && continue
      tags=$(host image inspect --format '{{range .RepoTags}}{{.}} {{end}}' "$id")
      [ -n "$tags" ] || continue
      # shellcheck disable=SC2086 # tags are space separated image names
      host save $tags | on_kiri load -q >&2
    done
    exit 0
    ;;
  pull | tag)
    # base images the builds start from must exist on both engines
    host "$@" >/dev/null 2>&1 || true
    exec env DOCKER_HOST="$kiri" "$real" "$@"
    ;;
  *) exec env DOCKER_HOST="$kiri" "$real" "$@" ;;
esac
