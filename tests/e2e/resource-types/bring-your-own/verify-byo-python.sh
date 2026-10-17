#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
readonly FIXTURE_DIR="${REPO_ROOT}/tests/e2e/fixtures/byo-python-health"
readonly SCHEMA="${REPO_ROOT}/engine/schemas/service-schema.json"
readonly WORK_BASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
readonly PROJECT_DIR="$(mktemp -d "${WORK_BASE%/}/tdk-byo-python.XXXXXX")"
readonly RESOURCE_DIR="${PROJECT_DIR}/services/shop/legacy"
readonly CLI="${TDK_BIN:-tdk}"

cleanup() {
  rm -rf "${PROJECT_DIR}"
}
trap cleanup EXIT

if ! command -v "${CLI}" >/dev/null 2>&1; then
  echo "tdk CLI not found: ${CLI}" >&2
  exit 1
fi
if ! command -v ajv >/dev/null 2>&1; then
  echo "Ajv CLI is required to validate service.json against the repository schema" >&2
  exit 1
fi

# project --yes runs machine preflight (including Tilt); this contract test
# deliberately needs no Docker or Tilt, so start from a minimal existing TDK
# project manifest and exercise the production resource and up CLI commands.
mkdir -p "${PROJECT_DIR}/.tdk" "${RESOURCE_DIR}"
cat > "${PROJECT_DIR}/.tdk/project.json" <<'JSON'
{
  "version": "1.0.0",
  "project": { "name": "byo-python-e2e", "version": "1.0.0" },
  "phases": {
    "pre_alpha": { "name": "Pre-Alpha", "description": "", "enabledStacks": [] },
    "alpha": { "name": "Alpha", "description": "", "enabledStacks": [] },
    "beta": { "name": "Beta", "description": "", "enabledStacks": [] },
    "out_of_scope": { "name": "Out of scope", "description": "", "enabledStacks": [] }
  },
  "optional_infra": {
    "monitoring": false,
    "elk": false,
    "debezium": false,
    "golden_image": false,
    "verdaccio": false
  },
  "discovery": { "paths": ["services/**"] }
}
JSON

cp -a "${FIXTURE_DIR}/." "${RESOURCE_DIR}/"
cd "${PROJECT_DIR}"

"${CLI}" resource legacy --type byo --stack shop --dockerfile ./Dockerfile --port 4500 --yes

test -f services/shop/legacy/service.json
test -f services/shop/legacy/AGENTS.md
test ! -d services/shop/legacy/src
test ! -f services/shop/legacy/package.json
test ! -f services/shop/legacy/tsconfig.json
test ! -f services/shop/legacy/health.conf
cmp "${FIXTURE_DIR}/Dockerfile" services/shop/legacy/Dockerfile
cmp "${FIXTURE_DIR}/app.py" services/shop/legacy/app.py
jq -e '.appType == "bring-your-own" and .stack == "shop" and .port == 4500 and .dockerfile == "./Dockerfile"' \
  services/shop/legacy/service.json >/dev/null
ajv validate --spec=draft7 --strict=false -s "${SCHEMA}" -d services/shop/legacy/service.json

"${CLI}" up shop --dry-run | tee "${PROJECT_DIR}/up-dry-run.txt"
grep -Fq -- "- legacy" "${PROJECT_DIR}/up-dry-run.txt"
