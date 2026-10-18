#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# An sdk resource on a live project, with no stack (#1295). An sdk already lives in packages/<name>, so S1 writes that folder and its
# service.json ("appType": "sdk") and registers it with `tdk resource --type sdk`. S2 checks `tdk status` lists it as an sdk. S3 runs
# the package's build script and S4 imports the built entry from a consumer script, which is the consumed-build check. The consumer
# is a plain node import, not a stack resource: an sdk is not served, so it has no route to check. Runs nightly, on release and by
# hand; see suite.json.
#
#   tests/e2e/resource-types/sdk/run.sh all              every case in order, then cleanup
#   tests/e2e/resource-types/sdk/run.sh S1 S2            single cases
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# shellcheck source=../common.sh
source "$SUITE_DIR/../common.sh"
e2e_init sdk sdk
STACK=shop
RES=shared-sdk
PKG="packages/$RES"
RESOURCES=()

S1() { # write the sdk's package and service.json, then register it
  log "S1 register an sdk from its package and service.json"
  rm -rf "$DIR"; mkdir -p "$DIR/$PKG/scripts"
  (cd "$DIR" && git init -q .)
  run scaffold-project project --yes
  [ "$RC" -eq 0 ] || die "tdk project --yes exited $RC"
  printf '{"appName":"%s","appType":"sdk"}\n' "$RES" >"$DIR/$PKG/service.json"
  cat >"$DIR/$PKG/package.json" <<JSON
{
  "name": "$RES",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/index.mjs",
  "exports": { ".": "./dist/index.mjs" },
  "scripts": { "dev": "node scripts/build.mjs", "build": "node scripts/build.mjs" }
}
JSON
  cat >"$DIR/$PKG/scripts/build.mjs" <<JS
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.mjs", 'export const ok = true;\nexport const name = "$RES";\n');
JS
  run "register-$RES" resource "$RES" --type sdk --path "$PKG" --stack "$STACK" --yes
  [ "$RC" -eq 0 ] || die "tdk resource $RES --type sdk exited $RC"
  jq -e '.appType == "sdk"' "$DIR/$PKG/service.json" >/dev/null || die "registering changed the appType"
}

S2() { # tdk status lists the registered resource as an sdk
  log "S2 tdk status lists $RES as an sdk"
  common_wait_status "$RES" sdk
}

S3() { # the package's build script writes its entry
  log "S3 build $RES with its build script"
  (cd "$DIR/$PKG" && npm run --silent build) >"$OUT/build-$RES.out" 2>&1 || die "npm run build in $PKG failed: $(cat "$OUT/build-$RES.out")"
  [ -f "$DIR/$PKG/dist/index.mjs" ] || die "build did not write $PKG/dist/index.mjs"
}

S4() { # a consumer imports the built entry and reads its exports
  log "S4 a consumer imports the built $RES"
  printf '%s\n' \
    "import { ok, name } from \"./$PKG/dist/index.mjs\";" \
    "if (ok !== true || name !== \"$RES\") { console.error(\"unexpected exports\", { ok, name }); process.exit(1); }" \
    "console.log(\"consumed\", name);" >"$DIR/consumer.mjs"
  (cd "$DIR" && node consumer.mjs) >"$OUT/consume-$RES.out" 2>&1 || die "consumer failed: $(cat "$OUT/consume-$RES.out")"
  grep -qx "consumed $RES" "$OUT/consume-$RES.out" || die "consumer did not print 'consumed $RES'"
}

e2e_main "$@"
