#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# Bring-your-own apps, one byoVariant per matrix leg (#1297). The variant and the example it checks come from suite.json; the matrix
# sets BYO_VARIANT, and this script runs only that variant's case:
#
#   BYO_VARIANT=example tests/e2e/resource-types/bring-your-own/run.sh all    the container alone (BY1)
#   BYO_VARIANT=tdk tests/e2e/resource-types/bring-your-own/run.sh all        through tdk up and Traefik (BY2)
#   tests/e2e/resource-types/bring-your-own/run.sh BY1                        a single case
#
# The verify scripts build the image, check the route and clean up after themselves, so this suite has no resources of its own.
# Needs: Docker, curl, and (for the tdk variant) the tdk CLI, Tilt and Node 22+.
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BYO_VARIANT="${BYO_VARIANT:-example}"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init bring-your-own "byo-$BYO_VARIANT"
RESOURCES=()

# The variant's entry in suite.json: its example name and the one case that checks it.
variant_field() { node -e 'const s=require(process.argv[1]); const v=s.variants.find(x=>x.id===process.argv[2]); if(!v) process.exit(1); console.log(v[process.argv[3]])' "$SUITE_DIR/suite.json" "$BYO_VARIANT" "$1"; }
example_name() { variant_field name; }

BY1() { # the example variant: the container alone answers its health route with 200
  local name
  name="$(example_name)"
  log "BY1 example $name runs alone and answers /health with 200"
  bash "$SUITE_DIR/verify-byo-example.sh" "$name" "$(variant_field health)"
}

BY2() { # the tdk variant: through tdk up and Traefik, with TDK's Postgres and DATABASE_URL
  local name
  name="$(example_name)"
  log "BY2 example $name through tdk up and Traefik"
  bash "$SUITE_DIR/verify-byo-tdk.sh" "$name" "$(variant_field health)"
}

# `all` runs only this variant's case: every leg of this suite is one variant, not every case in suite.json.
args=()
for a in "$@"; do
  if [ "$a" = all ]; then args+=("$(variant_field case)"); else args+=("$a"); fi
done
e2e_main "${args[@]}"
