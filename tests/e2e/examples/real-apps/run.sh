#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# The real example apps on a clean machine (moved from examples-e2e.yml, #1299). Each case is one step of the old workflow, with the
# same logic: A1 installs the published CLI, A2 sets up the project and runs doctor, A3 installs the frontend dependencies for the
# host typecheck, and A4 runs tdk up and requires the real routes to answer. The workflow checks out the app into $REPO_ROOT/example,
# runs one matrix leg per app and passes that leg's route checks in API_CHECKS and WEB_CHECKS ("pattern|path" lines). TDK_VERSION
# picks the npm version (latest by default). The workflow keeps its checkouts, Tilt and Postgres setup, tdk down and diagnostics.
#
#   API_CHECKS=$'reservation|/api/v1/reservations' WEB_CHECKS=$'floor-app|/' tests/e2e/examples/real-apps/run.sh A1 A2 A3 A4
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init real-apps real-apps
DIR="$REPO_ROOT/example"
# The app is a checkout owned by the workflow, not scratch space: the default cleanup only stops it, and never removes it.
e2e_cleanup() { [ -d "$DIR" ] && (cd "$DIR" && tdk down >/dev/null 2>&1 || true); }

A1() { # install TDK from npm
  log "A1 install TDK from npm"
  cd "$REPO_ROOT"
  TDK_VERSION="${TDK_VERSION:-latest}"
  node scripts/install-global.mjs "@tdk-landscape/tdk-cli-core@${TDK_VERSION}"
  tdk --version
}

A2() { # set up the project and check it with tdk doctor
  log "A2 set up the project and check it with tdk doctor"
  cd "$DIR"
  tdk project --yes
  tdk doctor
}

A3() { # install frontend dependencies for the host typecheck
  log "A3 install frontend dependencies for the host typecheck"
  # Frontends with a typecheck script get a host-side <service>-typecheck
  # resource in Tilt. It runs tsc on the runner, not in the image, so the
  # service's node_modules must exist here (tsc needs vite/client types).
  # Without this it fails with TS2688 on a clean checkout.
  cd "$DIR"
  for pkg in $(grep -l '"typecheck"' services/*/*/package.json 2>/dev/null || true); do
    echo "::group::bun install in $(dirname "$pkg")"
    (cd "$(dirname "$pkg")" && bun install)
    echo "::endgroup::"
  done
}

A4() { # tdk up, then prove the real routes answer
  log "A4 tdk up, then prove the real routes answer"
  cd "$DIR"
  WAIT_MINUTES="${WAIT_MINUTES:-18}"
  tdk up > up.log 2>&1 &
  started="$(date +%s)"

  # tdk up prints the URL of every service it will start, then hands off to Tilt.
  for _ in $(seq 1 90); do
    grep -q "Running tilt up" up.log && break
    sleep 2
  done
  awk '/Starting [0-9]+ service/{f=1} /Running tilt up/{f=0} f' up.log | grep -oE 'https?://[^ ]+' | sort -u > urls.txt || true
  [ -s urls.txt ] || grep -oE 'https?://[^ ]+' up.log | sort -u > urls.txt || true
  # Every routed URL ends in /health (frontends have an nginx healthcheck
  # too), so that suffix can't tell backend from frontend. The Traefik
  # host prefix TDK generates can: api.<project>.localhost vs
  # app.<project>.localhost.
  grep -E '^https?://api\.' urls.txt > backend-urls.txt || true
  grep -E '^https?://app\.' urls.txt > web-urls.txt || true
  echo "::group::URLs tdk up printed"
  cat urls.txt
  echo "::endgroup::"
  total="$(wc -l < backend-urls.txt | tr -d ' ')"
  if [ "$total" -eq 0 ]; then
    head -60 up.log
    echo "::error::tdk up printed no backend /health URLs"
    exit 1
  fi

  # 1) Every backend answers /health through Traefik.
  failed_checks=0
  ok=0
  for n in $(seq 1 $((WAIT_MINUTES * 4))); do
    ok="$(xargs -P 8 -I{} curl -s -o /dev/null -m 5 -w '%{http_code}\n' {} < backend-urls.txt | grep -c '^2' || true)"
    elapsed=$(( $(date +%s) - started ))
    echo "t=${elapsed}s healthy=${ok}/${total}"
    [ "$ok" -eq "$total" ] && break
    if [ $((n % 4)) -eq 0 ]; then
      bad="$(tilt get uiresources -o json 2>/dev/null | jq -r '[.items[] | select(.status.updateStatus == "error") | .metadata.name] | join(",")' || true)"
      if [ -n "$bad" ]; then
        failed_checks=$((failed_checks + 1))
        echo "::warning::Tilt reports failed resource(s): $bad (check $failed_checks of 2)"
        if [ "$failed_checks" -ge 2 ]; then
          echo "::error::Giving up early: failed to build and Tilt will not retry: $bad"
          exit 1
        fi
      else
        failed_checks=0
      fi
    fi
    sleep 15
  done
  [ "$ok" -eq "$total" ] || { echo "::error::Only $ok of $total backends became healthy within $WAIT_MINUTES minutes"; exit 1; }
  echo "All $total backends healthy after $(( $(date +%s) - started ))s"

  # 2) The real routes answer with real content.
  {
    echo "### ${GITHUB_JOB:-real-apps}: real routes"
    echo ""
    echo "| Check | URL | Result |"
    echo "|---|---|---|"
  } > results.md
  failures=0

  fetch() {
    # Frontends can lag the backends, so retry for a while.
    url="$1"
    for _ in $(seq 1 24); do
      code="$(curl -s -o body.txt -w '%{http_code}' -m 10 "$url" || true)"
      case "$code" in 2??) return 0 ;; esac
      sleep 5
    done
    return 1
  }

  while IFS='|' read -r pattern path; do
    [ -n "$pattern" ] || continue
    base="$(grep -E "$pattern" backend-urls.txt | head -1 | sed 's#/health$##' || true)"
    if [ -z "$base" ]; then
      echo "::error::no backend URL matches '$pattern'"
      echo "| API $pattern$path | (no matching URL) | ❌ |" >> results.md
      failures=$((failures + 1))
      continue
    fi
    url="$base$path"
    if fetch "$url" && jq -e . body.txt > /dev/null 2>&1; then
      echo "OK   $url"
      echo "| API \`$pattern$path\` | $url | ✅ 2xx, valid JSON |" >> results.md
    else
      echo "::error::$url did not return 2xx with valid JSON (last status ${code:-none})"
      head -c 400 body.txt || true; echo
      echo "| API \`$pattern$path\` | $url | ❌ status ${code:-none} |" >> results.md
      failures=$((failures + 1))
    fi
  done <<< "${API_CHECKS:-}"

  while IFS='|' read -r pattern path; do
    [ -n "$pattern" ] || continue
    # Frontend URLs are printed as their /health check; the page lives at the base.
    base="$(grep -E "$pattern" web-urls.txt | head -1 | sed -E 's#/+$##; s#/health$##' || true)"
    if [ -z "$base" ]; then
      echo "::error::no frontend URL matches '$pattern'"
      echo "| Page $pattern | (no matching URL) | ❌ |" >> results.md
      failures=$((failures + 1))
      continue
    fi
    url="$base$path"
    if fetch "$url" && grep -qi '<html' body.txt; then
      echo "OK   $url"
      echo "| Page \`$pattern\` | $url | ✅ 2xx, HTML document |" >> results.md
    else
      echo "::error::$url did not return 2xx with an HTML document (last status ${code:-none})"
      head -c 400 body.txt || true; echo
      echo "| Page \`$pattern\` | $url | ❌ status ${code:-none} |" >> results.md
      failures=$((failures + 1))
    fi
  done <<< "${WEB_CHECKS:-}"

  cat results.md >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  [ "$failures" -eq 0 ] || { echo "::error::$failures real-route check(s) failed"; exit 1; }
  echo "All real-route checks passed"
}

e2e_main "$@"
