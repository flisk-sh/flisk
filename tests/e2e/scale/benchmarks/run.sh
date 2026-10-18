#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# The tdk up warm and cold start benchmark on the restaurant example (moved from .github/workflows/benchmarks.yml, #1301). Each
# case is one step of the old measure job: B1 generates the project from this commit's extension, B2 runs the cold and warm
# starts with scripts/benchmark/tdk-up-warm-start.sh, B3 builds the HTML report and its summary. The job builds the CLI from
# this commit and installs Tilt first (the workflow's steps), and the publish job stays in the workflow: this suite measures,
# and the workflow decides what is published (scheduled and release runs only).
#
#   tests/e2e/scale/benchmarks/run.sh B1 B2 B3       the measurement, as in CI (COLD_RUNS and WARM_RUNS default to 1)
#   tests/e2e/scale/benchmarks/run.sh cleanup        tdk down in the restaurant project
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init benchmarks restaurant
# The restaurant checkout and the outputs sit where the workflow expects them (see the header and the upload step).
DIR="${RESTAURANT_DIR:-$REPO_ROOT/restaurant}"
BENCH_OUT="${RUNNER_TEMP:-$SUITE_ROOT}/bench"
SITE_OUT="${RUNNER_TEMP:-$SUITE_ROOT}/site"
export TDK_EXTENSION_SOURCE="${TDK_EXTENSION_SOURCE:-$REPO_ROOT}"
RESOURCES=()

B1() { # generate the restaurant project from this commit's extension
  log "B1 generate the restaurant project"
  cd "$DIR"
  tdk project --yes
}

B2() { # cold and warm starts of tdk up, each until eight services answer
  log "B2 cold and warm starts"
  local COLD_RUNS="${COLD_RUNS:-1}" WARM_RUNS="${WARM_RUNS:-1}"
  "$REPO_ROOT/scripts/benchmark/tdk-up-warm-start.sh" \
    --project "$DIR" \
    --out "$BENCH_OUT" \
    --cold-runs "$COLD_RUNS" \
    --warm-runs "$WARM_RUNS" \
    --healthy 8
}

B3() { # the report: the Pages site's HTML and the raw results, plus the job summary
  log "B3 build the report"
  local COMMIT="${COMMIT:-$(git -C "$REPO_ROOT" rev-parse HEAD)}"
  local RUN_URL="${RUN_URL:-${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-tdk-landscape/tdk-cli-core}/actions/runs/${GITHUB_RUN_ID:-0}}"
  local summary="${GITHUB_STEP_SUMMARY:-$OUT/step-summary.md}"
  node "$REPO_ROOT/scripts/benchmark/build-report.mjs" \
    --run "$BENCH_OUT" \
    --history "$REPO_ROOT/benchmarks/results" \
    --out "$SITE_OUT" \
    --commit "$COMMIT" \
    --run-url "$RUN_URL"
  cp -r "$BENCH_OUT" "$SITE_OUT/raw"
  {
    cat "$BENCH_OUT/summary.md"
    echo ""
    echo "Report: the Pages site for this repository (updated on main)."
  } >> "$summary"
  cat "$summary"
}

# The workflow's "Stop the project" step: the stack goes, the checkout stays.
e2e_cleanup() { (cd "$DIR" && tdk down || true); }

e2e_main "$@"
