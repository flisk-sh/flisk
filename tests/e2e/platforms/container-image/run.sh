#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The flisk CLI image (scripts/release/flisk-image.Dockerfile, docs/install/container.md) against the host's Docker. Every
# `flisk` this suite runs, the shared helpers' included, is a `docker run` of $FLISK_IMAGE with the documented mounts (the
# socket, and the project at the same path), through the wrapper that `image_on_path` puts first on PATH.
#
#   FLISK_IMAGE=flisk:1.4.28 VERSION=1.4.28 tests/e2e/platforms/container-image/run.sh CI1 CI2 CI3
#
# FLISK_IMAGE defaults to flisk:$VERSION, the tag `scripts/release/push-flisk-image.sh <assets> <version> --load` builds. The
# project directory must be one the Docker daemon can see at the same path: on a Linux host any path is; with Colima or Docker
# Desktop only the shared folders are (your home), so set E2E_ROOT=$HOME/.cache/flisk-e2e there.
# Needs: Docker with Buildx, jq, curl, Node 22+. Not flisk or Tilt: those come from the image.
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init container-image flimg
# shellcheck disable=SC2034 # read by e2e_diagnostics in lib.sh
RESOURCES=(hello)
STACK=app
FLISK_IMAGE="${FLISK_IMAGE:-flisk:${VERSION:-}}"
UP_CONTAINER="$PROJECT-flisk-up"
# Alternate ports, so the suite never meets a stack that already holds 80, 443, 5432 or 10350.
export FLISK_HTTP_PORT="${FLISK_HTTP_PORT:-$((30000 + RANDOM % 2000))}"
export FLISK_HTTPS_PORT="${FLISK_HTTPS_PORT:-$((32000 + RANDOM % 2000))}"
export FLISK_POSTGRES_PORT="${FLISK_POSTGRES_PORT:-$((34000 + RANDOM % 2000))}"
export TILT_PORT="${TILT_PORT:-$((36000 + RANDOM % 2000))}"

image_on_path() {
  [ "$FLISK_IMAGE" != "flisk:" ] || die "set FLISK_IMAGE (or VERSION) to the image to test"
  docker image inspect "$FLISK_IMAGE" >/dev/null 2>&1 || docker pull -q "$FLISK_IMAGE" >/dev/null \
    || die "$FLISK_IMAGE is neither local nor pullable"
  mkdir -p "$SUITE_ROOT/bin"
  # The documented form: the socket, the working directory at the same path, the Tilt UI port published. `up` gets a fixed name,
  # and `down` stops that container first: Tilt runs inside it, `flisk down` in another container cannot stop that process, and a
  # live Tilt re-creates the containers that `tilt down` removed.
  cat >"$SUITE_ROOT/bin/flisk" <<SH
#!/usr/bin/env bash
[ "\${1:-}" != down ] || docker stop "$UP_CONTAINER" >/dev/null 2>&1 || true
extra=()
[ "\${1:-}" != up ] || extra=(--name "$UP_CONTAINER" -p "\$TILT_PORT:\$TILT_PORT")
exec docker run --rm -i -v /var/run/docker.sock:/var/run/docker.sock -v "\$PWD:\$PWD" -w "\$PWD" \\
  -e FLISK_HTTP_PORT -e FLISK_HTTPS_PORT -e FLISK_POSTGRES_PORT -e TILT_PORT "\${extra[@]}" "$FLISK_IMAGE" "\$@"
SH
  chmod +x "$SUITE_ROOT/bin/flisk"
  export PATH="$SUITE_ROOT/bin:$PATH"
}

check_passed() { # <doctor json file> <check name> -> true, false or missing
  jq -r --arg n "$2" '[(.data.checks // .checks // [])[] | select(.name == $n) | .didPass | tostring][0] // "missing"' "$1"
}

CI1() { # the image runs the released CLI and finds Docker, Compose and Tilt through the mounted socket, and only through it
  log "CI1 $FLISK_IMAGE: --version, doctor with and without the Docker socket"
  image_on_path
  # Outside any project, so doctor checks the machine only.
  local empty="$SUITE_ROOT/no-project"
  mkdir -p "$empty"
  run_in "$empty" version --version
  [ "$RC" -eq 0 ] || die "flisk --version exited $RC"
  local got; got="$(tr -d '[:space:]' <"$OUT/version.out")"
  [ -z "${VERSION:-}" ] || [ "$got" = "$VERSION" ] || die "the image runs flisk $got, expected $VERSION"
  run_in "$empty" doctor doctor --json
  local check
  for check in "Container Runtime" "Docker Compose" "Docker Versions" "Tilt CLI"; do
    [ "$(check_passed "$OUT/doctor.out" "$check")" = true ] || die "doctor check '$check' did not pass in the image"
  done
  # Rule one of the guide: without the socket the image has no Docker to talk to, and doctor says so.
  printf '$ docker run --rm %s doctor --json   # no socket\n' "$FLISK_IMAGE"
  (cd "$empty" && docker run --rm "$FLISK_IMAGE" doctor --json) >"$OUT/doctor-no-socket.out" 2>/dev/null || true
  [ "$(check_passed "$OUT/doctor-no-socket.out" "Container Runtime")" = false ] \
    || die "doctor without the socket did not report the missing Docker daemon"
}

hello_healthy() { [ "$(traefik_request hello /health -o /dev/null -w '%{http_code}')" = "200" ]; }
tilt_ui_up() { [ "$(direct -o /dev/null -w '%{http_code}' "http://127.0.0.1:$TILT_PORT/")" = "200" ]; }

CI2() { # flisk up from the image starts a backend on the host's Docker, reachable from the host through Traefik
  log "CI2 flisk project, resource and up from $FLISK_IMAGE"
  image_on_path
  # A stack left by an earlier run would answer the checks below before this run's containers replace it.
  e2e_cleanup
  docker rm -f "$UP_CONTAINER" >/dev/null 2>&1 || true
  mkdir -p "$DIR" && git -C "$DIR" init -q
  run project project --yes
  [ "$RC" -eq 0 ] || die "flisk project exited $RC"
  run resource resource hello --type backend --stack "$STACK" --yes
  [ "$RC" -eq 0 ] || die "flisk resource exited $RC"
  start_stack "$STACK"
  wait_status_url hello
  poll_until "hello answers /health 200 through Traefik on the host" "$READY_TIMEOUT" hello_healthy
  traefik_request_ok hello /health
  # Rule four: Tilt listens on all interfaces in the image (TILT_HOST), so the published port reaches its UI from the host.
  poll_until "Tilt UI answers on the published port $TILT_PORT" 60 tilt_ui_up
  run down down --yes
  [ "$RC" -eq 0 ] || die "flisk down exited $RC"
  [ -z "$(running_container hello)" ] || die "hello still runs after flisk down"
  [ -z "$(docker ps -q --filter "name=^$UP_CONTAINER\$")" ] || die "the flisk up container still runs after flisk down"
}

CI3() { # the MCP form from the guide: `docker run -i ... flisk mcp` speaks MCP over stdio
  log "CI3 flisk mcp over stdio from $FLISK_IMAGE"
  image_on_path
  mkdir -p "$DIR"
  FLISK_BIN="$SUITE_ROOT/bin/flisk" mcp_session mcp '[{"tool":"doctor","arguments":{}}]'
  assert check "$OUT/mcp.out" 'j.initialize && j.initialize.protocolVersion' "MCP initialize returned no protocol version"
  assert check "$OUT/mcp.out" '["up","status","doctor"].every((n) => j.tools.some((t) => t.name === n))' \
    "tools/list lacks up, status or doctor"
  assert check "$OUT/mcp.out" 'j.calls[0].result && !j.calls[0].result.isError' "the doctor tool call failed in the image"
}

e2e_main "$@"
