#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The 100-service fixture bench booted on a clean machine (moved from the retired erp-scale-e2e workflow, #1301). The fixture is
# flisk-sh/tdk-erp-system, checked out next to this repository as erp/ (ERP_DIR overrides it). E1 generates the project and
# runs flisk doctor, E2 runs flisk up and waits for every backend to answer /health through Traefik, E3 writes the report. The
# workflow runs E1-E3 in one step, so the cases share the project and the timings; diagnostics and cleanup are the workflow's
# failure and always steps.
#
#   tests/e2e/scale/erp/run.sh E1 E2 E3          the whole boot, as in CI
#   SCOPE=one-stack STACK=finance tests/e2e/scale/erp/run.sh E1 E2 E3    about 16 services
#   ERP_DIR=<dir> tests/e2e/scale/erp/run.sh E1 E2 E3    use a fixture checkout that is somewhere else
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init erp erp
# The fixture directory is fixed (the workflow checks it out as erp/ in the repository root), so it is not under SUITE_ROOT.
DIR="${ERP_DIR:-$REPO_ROOT/erp}"
RESOURCES=()

E1() { # generate the project from the fixture and check the machine with flisk doctor
  log "E1 set up the project and check it with flisk doctor"
  cd "$DIR"
  flisk project --yes
  flisk doctor
}

E2() { # flisk up, then wait for every backend to answer /health (the frontends are reported, not gated)
  log "E2 flisk up, then wait for every backend to answer /health"
  local SCOPE="${SCOPE:-full}" STACK="${STACK:-finance}" WAIT_MINUTES="${WAIT_MINUTES:-75}"
  cd "$DIR"
  if [ "$SCOPE" = "one-stack" ]; then
    flisk up "$STACK" > up.log 2>&1 &
  else
    flisk up > up.log 2>&1 &
  fi
  started="$(date +%s)"

  # flisk up prints the URL of every service it will start, then hands off to Tilt.
  for _ in $(seq 1 90); do
    grep -q "Running tilt up" up.log && break
    sleep 2
  done
  awk '/Starting [0-9]+ service/{f=1} /Running tilt up/{f=0} f' up.log | grep -oE 'https?://[^ ]+' | sort -u > urls.txt || true
  grep -E '^https?://api\.' urls.txt > backend-urls.txt || true
  grep -E '^https?://app\.' urls.txt > frontend-urls.txt || true
  total="$(wc -l < backend-urls.txt | tr -d ' ')"
  frontends="$(wc -l < frontend-urls.txt | tr -d ' ')"
  if [ "$total" -eq 0 ]; then
    head -60 up.log
    echo "::error::flisk up printed no backend URLs"
    exit 1
  fi
  echo "Waiting for $total backend URLs. $frontends frontend URLs are reported but not gated."
  backends_total="$total"
  frontends_total="$frontends"

  failed_checks=0
  for n in $(seq 1 $((WAIT_MINUTES * 4))); do
    ok="$(xargs -P 24 -I{} curl -s -o /dev/null -m 5 -w '%{http_code}\n' {} < backend-urls.txt | grep -c '^2' || true)"
    elapsed=$(( $(date +%s) - started ))
    echo "t=${elapsed}s healthy=${ok}/${total}"
    if [ "$ok" -eq "$total" ]; then
      all_healthy_seconds="$elapsed"
      echo "All $total backends healthy after ${elapsed}s"
      return 0
    fi

    # Once a minute: show what is happening, and stop early if a build failed.
    # Tilt does not retry a failed image build, so it will never recover.
    if [ $((n % 4)) -eq 0 ]; then
      echo "::group::progress at ${elapsed}s"
      docker ps -a --format '{{.Status}}' | sed -E 's/ \(.*\)//; s/^(Up|Exited|Created|Restarting).*/\1/' | sort | uniq -c
      echo "healthy containers: $(docker ps --filter health=healthy -q | wc -l)  unhealthy: $(docker ps --filter health=unhealthy -q | wc -l)"
      echo "images: $(docker images -q | sort -u | wc -l)"
      echo "-- flisk up log (last 5 lines):"
      tail -5 up.log
      echo "::endgroup::"
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
  echo "::error::Only $ok of $total backends became healthy within $WAIT_MINUTES minutes"
  exit 1
}

E3() { # the report: CLI version, runner size, timings, frontends, containers, memory and disk
  log "E3 report"
  cd "$DIR"
  local fe_ok containers mem_mib summary="${GITHUB_STEP_SUMMARY:-$OUT/step-summary.md}"
  fe_ok="$(xargs -P 8 -I{} curl -s -o /dev/null -m 5 -w '%{http_code}\n' {} < frontend-urls.txt | grep -c '^2' || true)"
  containers="$(docker ps -q | wc -l)"
  mem_mib="$(docker stats --no-stream --format '{{.MemUsage}}' | awk '{v=$1; if (v ~ /GiB/) {sub(/GiB/,"",v); s+=v*1024} else if (v ~ /MiB/) {sub(/MiB/,"",v); s+=v} else if (v ~ /KiB/) {sub(/KiB/,"",v); s+=v/1024}} END {printf "%.0f", s}')"
  {
    echo "### 🏭 ERP boot on a clean GitHub-hosted runner"
    echo ""
    echo "| | |"
    echo "|---|---|"
    echo "| CLI | \`$(flisk --version)\` |"
    echo "| Runner | $(nproc) vCPU, $(free -g | awk '/Mem:/{print $2}') GB RAM |"
    echo "| Backends healthy | **${backends_total} / ${backends_total}** through Traefik |"
    echo "| Time to all backends healthy | **${all_healthy_seconds}s** (includes building every image) |"
    echo "| Frontends answering (not gated) | ${fe_ok} / ${frontends_total} |"
    echo "| Running containers | ${containers} |"
    echo "| Memory used by all containers | ${mem_mib} MiB |"
    echo "| Disk used | $(df -h / | awk 'NR==2{print $3" of "$2}') |"
  } >> "$summary"
  cat "$summary"
}

# The workflow's diagnostics on failure: what a person would look at first when the boot does not finish.
e2e_diagnostics() {
  cd "$DIR" 2>/dev/null || return 0
  echo "::group::flisk up log (last 200 lines)"
  tail -200 up.log 2>/dev/null || true
  echo "::endgroup::"
  echo "::group::containers that are not healthy"
  docker ps -a --format 'table {{.Names}}\t{{.Status}}' | grep -vE '\((healthy)\)' | head -60 || true
  echo "::endgroup::"
  echo "::group::tilt resources in error"
  tilt get uiresources -o json 2>/dev/null | jq -r '.items[] | select(.status.updateStatus == "error") | "\(.metadata.name): \((.status.buildHistory // [] | map(.error // empty) | first) // "-")"' | head -40 || true
  echo "::endgroup::"
  echo "::group::resources"
  free -h
  df -h /
  docker system df || true
  echo "::endgroup::"
  echo "::group::flisk doctor"
  flisk doctor || true
  echo "::endgroup::"
}

# The workflow's flisk down. The fixture is a checkout, so it stays on disk; only the stack goes.
e2e_cleanup() { (cd "$DIR" && flisk down || true); }

e2e_main "$@"
