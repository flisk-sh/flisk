#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# The README quickstart on a clean machine (moved from quickstart-e2e.yml, #1298). Each case is one step of the old workflow, with the
# same logic: Q1 scaffolds, Q2 runs tdk up and waits for every /health, Q3 records the time to a healthy stack, Q4 checks that each
# frontend serves its built app. The project stays at $RUNNER_TEMP/shop (or $TMPDIR/shop locally) so the workflow's diagnostics and
# artifact paths do not change.
#
#   tests/e2e/journeys/quickstart/run.sh all          every case in order, then cleanup
#   tests/e2e/journeys/quickstart/run.sh Q1 Q2        single cases
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init quickstart shop
# The quickstart directory is fixed so the workflow's diagnostics and artifacts find it (see the header).
DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/shop"
RESOURCES=(orders-api storefront vue-app)

Q1() { # scaffold the quickstart project: a backend, a React frontend and a Vue frontend
  log "Q1 scaffold the quickstart project"
  mkdir -p "$DIR" && cd "$DIR"
  # Start of the "time to healthy stack" clock: from `tdk project --yes` to every /health URL answering (see Q3).
  date +%s > "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/quickstart-t0"
  tdk project --yes
  tdk doctor
  printf 'y\n' | tdk resource orders-api --type backend --stack shop
  # Frontends go through the framework providers and their Starlark Vite templates. Published versions from before --framework existed
  # skip them, so the nightly check of `latest` keeps testing what it can.
  if tdk resource --help | grep -q -- '--framework'; then
    # No --path: this exercises the default folder (which tdk picks so that project.json discovery finds it) and the public/ folder the
    # frontend Docker build copies.
    printf 'y\n' | tdk resource storefront --type frontend --stack shop
    printf 'y\n' | tdk resource vue-app --type frontend --framework vue --stack shop
    FRONTENDS="storefront:root vue-app:no-such-mount"
    export FRONTENDS
    echo "FRONTENDS=storefront:root vue-app:app" >> "${GITHUB_ENV:-/dev/null}"
  else
    echo "::notice::this tdk version has no --framework; testing the backend only"
  fi
  # Log what discovery will see, so a missing service is obvious here rather than 20 minutes later as a 404.
  echo "::group::scaffolded project"
  echo "discovery paths: $(jq -c '.discovery.paths' .tdk/project.json)"
  find . -name service.json -not -path './node_modules/*' -not -path './.tdk/*' \
    | sort | while read -r f; do echo "$f: $(jq -c '{name,type,framework,stack}' "$f")"; done
  echo "::endgroup::"
  tdk doctor
}

Q2() { # tdk up, then wait for every /health URL to answer through Traefik
  log "Q2 tdk up and wait for every /health"
  cd "$DIR"
  tdk up shop > up.log 2>&1 &
  # One URL per service: the backend, plus each frontend scaffolded in Q1. Each entry is <route segment>:<Tilt resource name>.
  local services="orders:orders-api"
  local fe
  for fe in ${FRONTENDS:-}; do services="$services ${fe%%:*}:${fe%%:*}"; done
  local urls="" pair svc url
  for pair in $services; do
    svc="${pair%%:*}"
    url=""
    for _ in $(seq 1 60); do
      url="$(grep -oE "https?://[^ ]*/${svc}[^ ]*/health" up.log | head -1 || true)"
      [ -n "$url" ] && break
      sleep 2
    done
    [ -n "$url" ] || { cat up.log; die "tdk up never printed the $svc URL"; }
    urls="$urls $url"
  done
  echo "Waiting for:$urls"
  local failed_checks=0 missing_checks=0 n pending code bad known missing res
  for n in $(seq 1 120); do
    pending=""
    for url in $urls; do
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
      case "$code" in
        2??) ;;
        *) pending="$pending $url=$code" ;;
      esac
    done
    if [ -z "$pending" ]; then
      echo "All healthy after $((n * 10))s:$urls"
      return 0
    fi
    echo "poll $n ($((n * 10))s): waiting on$pending"
    # Once a minute, show what is actually happening so a slow first boot can be told apart from a container that never turns healthy.
    if [ $((n % 6)) -eq 0 ]; then
      echo "::group::progress at $((n * 10))s"
      docker ps -a --format 'table {{.Names}}\t{{.Status}}' | head -20 || true
      echo "-- images built so far:"
      docker images --format '{{.Repository}}:{{.Tag}}  {{.CreatedSince}}' | head -12 || true
      echo "-- tilt resources (name, update, runtime, what it is waiting on):"
      tilt get uiresources -o json 2>/dev/null | jq -r '.items[] | "\(.metadata.name)  update=\(.status.updateStatus // "-")  runtime=\(.status.runtimeStatus // "-")  waiting=\(.status.waiting // {} | tostring)  err=\((.status.buildHistory // [] | map(.error // empty) | first) // "-")"' || echo "(tilt not reachable)"
      echo "-- tdk up log (last 8 lines):"
      tail -8 up.log || true
      echo "::endgroup::"
      # Tilt does not retry a failed image build, so a service whose update status is "error" will never turn healthy. Two checks in a row
      # (about a minute apart) before giving up, so a transient error can clear.
      bad="$(tilt get uiresources -o json 2>/dev/null | jq -r '[.items[] | select(.status.updateStatus == "error") | .metadata.name] | join(",")' || true)"
      if [ -n "$bad" ]; then
        failed_checks=$((failed_checks + 1))
        echo "::warning::Tilt reports failed resource(s): $bad (check $failed_checks of 2)"
        if [ "$failed_checks" -ge 2 ]; then
          die "Giving up early: $bad failed to build and Tilt will not retry it"
        fi
      else
        failed_checks=0
      fi
      # A route can only turn healthy if Tilt has a resource for it. If a service was never discovered it never will, so say so and stop.
      known="$(tilt get uiresources -o json 2>/dev/null | jq -r '.items[].metadata.name' || true)"
      missing=""
      for pair in $services; do
        res="${pair##*:}"
        echo "$known" | grep -qx "$res" || missing="$missing $res"
      done
      if [ -n "$missing" ]; then
        missing_checks=$((missing_checks + 1))
        echo "::warning::Tilt has no resource for:$missing (check $missing_checks of 2)"
        if [ "$missing_checks" -ge 2 ]; then
          echo "-- resources Tilt does know about:"; echo "$known"
          echo "-- discovery paths and service.json files:"
          jq -c '.discovery.paths' .tdk/project.json
          find . -name service.json -not -path './node_modules/*' -not -path './.tdk/*' | sort
          die "Giving up early: Tilt never created a resource for:$missing"
        fi
      else
        missing_checks=0
      fi
    fi
    sleep 10
  done
  tail -200 up.log
  die "not healthy within 20 minutes:$pending"
}

Q3() { # the time to a healthy stack, from tdk project --yes, recorded as a job summary line and a JSON file
  log "Q3 record the time to a healthy stack"
  local t0 t1 seconds
  t0="$(cat "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/quickstart-t0")"
  t1="$(date +%s)"
  seconds=$((t1 - t0))
  printf '{"metric":"time_to_healthy_stack","seconds":%d,"tdk_version":"%s","runner":"%s","start_epoch":%d,"healthy_epoch":%d,"start_cache":"cold"}\n' \
    "$seconds" "${TDK_VERSION:-local}" "${RUNNER_OS:-$(uname -s)}" "$t0" "$t1" > "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/time-to-healthy.json"
  cat "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/time-to-healthy.json"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### Time to healthy stack"
      echo ""
      echo "- tdk version: \`${TDK_VERSION:-local}\`"
      echo "- \`tdk project --yes\` to every /health answering: **${seconds}s** ($((seconds / 60))m $((seconds % 60))s)"
      echo "- Cold start: no images or build cache on the runner"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
}

Q4() { # nginx answers /health on its own, so also load each frontend's page and the script it references: the framework's Vite build output is what is being served, under the right base path
  log "Q4 frontends serve their built app"
  [ -n "${FRONTENDS:-}" ] || { echo "no frontends in this run"; return 0; }
  cd "$DIR"
  local fe name mount health page origin html script
  for fe in $FRONTENDS; do
    name="${fe%%:*}"
    mount="${fe##*:}"
    health="$(grep -oE "https?://[^ ]*/${name}/health" up.log | head -1)"
    page="${health%/health}/"
    origin="$(echo "$page" | grep -oE '^https?://[^/]+')"
    html="$(curl -fsS --max-time 10 "$page")"
    echo "$html" | grep -q "id=\"$mount\"" \
      || { echo "$html"; die "$name: page has no #$mount mount point"; }
    script="$(echo "$html" | grep -oE '<script[^>]+src="[^"]+"' | grep -oE 'src="[^"]+"' | head -1 | cut -d'"' -f2)"
    case "$script" in
      "/$name/"*) ;;
      *) echo "$html"; die "$name: entry script '$script' is not under /$name/" ;;
    esac
    curl -fsS --max-time 10 -o /dev/null "$origin$script" \
      || die "$name: $origin$script did not load"
    echo "$name: $page serves #$mount and $script"
  done
}

e2e_main "$@"
