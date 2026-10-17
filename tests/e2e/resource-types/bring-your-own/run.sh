#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# Bring-your-own apps, one byoVariant per matrix leg (#1297). The variant's arguments come from suite.json; the matrix sets
# BYO_VARIANT, and this script runs only that variant's case:
#
#   BYO_VARIANT=example tests/e2e/resource-types/bring-your-own/run.sh all    the container alone (BY1)
#   BYO_VARIANT=tdk tests/e2e/resource-types/bring-your-own/run.sh all        through tdk up and Traefik (BY2)
#   BYO_VARIANT=job tests/e2e/resource-types/bring-your-own/run.sh all        a one-shot job through tdk up (BY3)
#   BYO_VARIANT=pair tests/e2e/resource-types/bring-your-own/run.sh all       a dependency and an app through tdk up (BY4)
#   tests/e2e/resource-types/bring-your-own/run.sh BY1                         a single case
#
# The verify scripts build images, run them and clean up after themselves, so this suite has no resources of its own.
# Needs: Docker, curl, and (for the tdk, job and pair variants) the tdk CLI, Tilt and Node 22+.
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SUITE_DIR/../../../.." && pwd)"
BYO_VARIANT="${BYO_VARIANT:-example}"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init bring-your-own "byo-$BYO_VARIANT"
RESOURCES=()

# One field of this variant's entry in suite.json: id, case or args.
variant_field() { node -e 'const s=require(process.argv[1]); const v=s.variants.find(x=>x.id===process.argv[2]); if(!v) process.exit(1); console.log(v[process.argv[3]])' "$SUITE_DIR/suite.json" "$BYO_VARIANT" "$1"; }

# Each case runs its verify script with the variant's arguments (word-split on purpose: they are plain names and paths).
run_verify() { # <verify script> <case label>
  local script="$1" label="$2"
  log "$label with arguments: $(variant_field args)"
  # shellcheck disable=SC2046
  bash "$SUITE_DIR/$script" $(variant_field args)
}

BY1() { run_verify verify-byo-example.sh "BY1 example runs alone and answers its health route with 200"; }
BY2() { run_verify verify-byo-tdk.sh "BY2 through tdk up and Traefik, with TDK's Postgres and DATABASE_URL"; }
BY3() { run_verify verify-byo-job.sh "BY3 one-shot job exits 0 and its query returns the expected row"; }
BY4() { run_verify verify-byo-pair.sh "BY4 dependency and app round trip through tdk up and Traefik"; }
# The dry run validates service.json with the ajv CLI. Install it from scripts/ajv-cli when the runner does not have it (the old
# workflow did this too).
BY5() {
  log "BY5 python resource contract and up --dry-run (no Docker or Tilt)"
  if ! command -v ajv >/dev/null 2>&1; then
    npm ci --prefix "$REPO_ROOT/scripts/ajv-cli" --ignore-scripts --no-audit --no-fund
    PATH="$REPO_ROOT/scripts/ajv-cli/node_modules/.bin:$PATH"
    export PATH
  fi
  bash "$SUITE_DIR/verify-byo-python.sh"
}
BY6() { log "BY6 python fixture boots through tdk up and answers its health route"; bash "$SUITE_DIR/verify-byo-python-boot.sh"; }

# \`all\` runs only this variant's case: every leg of this suite is one variant, not every case in suite.json.
args=()
for a in "$@"; do
  if [ "$a" = all ]; then args+=("$(variant_field case)"); else args+=("$a"); fi
done
e2e_main "${args[@]}"
