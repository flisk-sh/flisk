#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# A library resource on a live project, with no stack (#1295). `flisk resource --type` does not accept library, the same as migrator, so
# L1 writes the library's package and its service.json ("appType": "library") under packages/, then registers that existing folder
# with `flisk resource --path`. L2 checks `flisk status` lists it as a library. L3 runs the package's build script and L4 imports the
# built entry from a consumer script, which is the consumed-build check. The consumer is a plain node import, not a stack resource:
# a library is not served, so it has no route to check. Runs nightly, on release and by hand; see suite.json.
#
#   tests/e2e/resource-types/library/run.sh all              every case in order, then cleanup
#   tests/e2e/resource-types/library/run.sh L1 L2            single cases
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# shellcheck source=../common.sh
source "$SUITE_DIR/../common.sh"
e2e_init library library
STACK=shop
RES=shared-lib
PKG="packages/$RES"
RESOURCES=()

L1() { # write the library's package and service.json, then register the existing folder
  log "L1 register a library from its package and service.json"
  rm -rf "$DIR"; mkdir -p "$DIR/$PKG"
  (cd "$DIR" && git init -q .)
  run scaffold-project project --yes
  [ "$RC" -eq 0 ] || die "flisk project --yes exited $RC"
  printf '{"appName":"%s","appType":"library"}\n' "$RES" >"$DIR/$PKG/service.json"
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
  mkdir -p "$DIR/$PKG/scripts"
  cat >"$DIR/$PKG/scripts/build.mjs" <<JS
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.mjs", 'export const ok = true;\nexport const name = "$RES";\n');
JS
  run "register-$RES" resource "$RES" --path "$PKG" --stack "$STACK" --yes
  [ "$RC" -eq 0 ] || die "flisk resource $RES (register existing library) exited $RC"
  jq -e '.appType == "library"' "$DIR/$PKG/service.json" >/dev/null || die "registering changed the appType"
}

L2() { # flisk status lists the registered resource as a library
  log "L2 flisk status lists $RES as a library"
  common_wait_status "$RES" library
}

L3() { # the package's build script writes its entry
  log "L3 build $RES with its build script"
  (cd "$DIR/$PKG" && npm run --silent build) >"$OUT/build-$RES.out" 2>&1 || die "npm run build in $PKG failed: $(cat "$OUT/build-$RES.out")"
  [ -f "$DIR/$PKG/dist/index.mjs" ] || die "build did not write $PKG/dist/index.mjs"
}

L4() { # a consumer imports the built entry and reads its exports
  log "L4 a consumer imports the built $RES"
  printf '%s\n' \
    "import { ok, name } from \"./$PKG/dist/index.mjs\";" \
    "if (ok !== true || name !== \"$RES\") { console.error(\"unexpected exports\", { ok, name }); process.exit(1); }" \
    "console.log(\"consumed\", name);" >"$DIR/consumer.mjs"
  (cd "$DIR" && node consumer.mjs) >"$OUT/consume-$RES.out" 2>&1 || die "consumer failed: $(cat "$OUT/consume-$RES.out")"
  grep -qx "consumed $RES" "$OUT/consume-$RES.out" || die "consumer did not print 'consumed $RES'"
}

e2e_main "$@"
