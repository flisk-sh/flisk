#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# plMail (https://github.com/karatektus/pl_mail) is a real project that runs on Docker Compose. Its maintainer asked us to keep
# any Flisk recipe on our side and to follow release tags, not main (karatektus/pl_mail#467). This journey does that: it clones the
# latest plMail tag unchanged, imports it, and proves the result keeps what the Compose file says and still boots.
#
#   tests/e2e/journeys/plmail/run.sh all          every case in order, then cleanup
#   PLMAIL_TAG=v0.4.1 tests/e2e/journeys/plmail/run.sh PM1 PM2   a pinned tag, single cases
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# The project directory is named pl_mail on purpose: Compose names volumes <directory>_<volume>, and Flisk keeps those names.
e2e_init plmail pl_mail
READY_TIMEOUT="${E2E_READY_TIMEOUT:-420}" # php is healthy in about a minute; fail in minutes, not 20
RESOURCES=(php worker database secrets-init)
STACK="pl-mail"
HTTP_PORT_E2E="${PLMAIL_HTTP_PORT:-18080}"
HTTPS_PORT_E2E="${PLMAIL_HTTPS_PORT:-18443}"
# plMail serves HTTPS through Caddy (FrankenPHP) with its own local certificate, and redirects plain HTTP to https://localhost/
# without the remapped port. So the probe goes to the HTTPS port directly, accepts the local certificate (-k), and expects the
# first hop to be the login page, or the installer on a fresh database.
php_redirects_to_login() {
  local location
  location="$(curl -sSk --max-time 10 -o /dev/null -w '%{redirect_url}' "https://localhost:$HTTPS_PORT_E2E/")" || return 1
  [[ "$location" == */login || "$location" == */install ]]
}

PM1() { # clone the latest release tag unchanged and import it; nothing of plMail's own files may change
  log "PM1 flisk import of the latest plMail tag"
  rm -rf "$DIR" && mkdir -p "$SUITE_ROOT"
  local tag="${PLMAIL_TAG:-}"
  if [ -z "$tag" ]; then
    tag="$(git ls-remote --tags --refs https://github.com/karatektus/pl_mail 'v*' | sed -E 's#.*refs/tags/##' | sort -V | tail -1)"
  fi
  [ -n "$tag" ] || die "could not find a plMail release tag"
  echo "plMail tag: $tag"
  git clone --quiet --depth 1 --branch "$tag" https://github.com/karatektus/pl_mail "$DIR"
  cd "$DIR"
  echo "$tag" > "$SUITE_ROOT/tag"
  run import import . --yes
  [ "$RC" -eq 0 ] || die "flisk import failed on plMail $tag"
  # plMail's own files stay as the maintainer wrote them: only .flisk/ and services/ are new.
  local changed
  changed="$(git status --porcelain --untracked-files=no)"
  [ -z "$changed" ] || die "flisk import modified plMail's tracked files: $changed"
  [ "$(git status --porcelain | sed -E 's/^.. //' | sort | tr '\n' ' ')" = ".flisk/ services/ " ] || die "flisk import wrote outside .flisk/ and services/: $(git status --porcelain)"
  [ "$(find services/$STACK -name service.json | wc -l | tr -d ' ')" = 5 ] || die "expected 5 services (secrets-init, php, worker, database, ntfy)"
}

PM2() { # what compose.yaml says survives the import
  log "PM2 the import keeps names, volumes, ports and profiles"
  cd "$DIR/services/$STACK"
  # Volumes keep their Compose names, so a stack started with docker compose keeps its data under Flisk.
  jq -e '[.volumes[].name] | index("pl_mail_database_data") != null' database/service.json >/dev/null || die "database volume is not pl_mail_database_data"
  jq -e '[.volumes[].name] | index("pl_mail_app_secrets") != null' php/service.json >/dev/null || die "php does not keep pl_mail_app_secrets"
  jq -e '.container.networkAliases == ["mercure"]' worker/service.json >/dev/null || die "worker lost its mercure alias"
  jq -e '.container.stopGracePeriod == "30s"' worker/service.json >/dev/null || die "worker lost stop_grace_period 30s"
  jq -e '.healthCheck == false' worker/service.json >/dev/null || die "worker healthcheck is not disabled"
  jq -e '.profiles == ["push"]' ntfy/service.json >/dev/null || die "ntfy is not behind the push profile"
  jq -e '.env.APP_ENV == "prod"' php/service.json >/dev/null || die "php lost APP_ENV=prod"
  jq -e '[.extraPorts[].publish] | contains(["${HTTP_PORT:-80}", "${HTTPS_PORT:-443}"])' php/service.json >/dev/null || die "php lost its variable host ports"
  jq -e '.env.SERVER_NAME | test(", php:80$")' php/service.json >/dev/null || die "php SERVER_NAME lost its literal tail"
  jq -e '.dependsOn | map(select(.name=="database"))[0].condition == "service_healthy"' php/service.json >/dev/null || die "php lost depends_on database healthy"
}

PM3() { # the standalone Compose file is generated, stays in step, and Docker accepts it
  log "PM3 flisk export compose, --check, docker compose config"
  cd "$DIR"
  run export export compose
  [ "$RC" -eq 0 ] || die "flisk export compose failed"
  run check export compose --check
  [ "$RC" -eq 0 ] || die "flisk export compose --check says the file is out of date right after writing it"
  grep -q '^name: "pl_mail"' .autogenerated/docker-compose.yml || die "exported Compose project is not named pl_mail"
  docker compose --env-file .env -f .autogenerated/docker-compose.yml config -q || die "docker compose rejects the generated file"
  docker compose --env-file .env -f .autogenerated/docker-compose.yml --profile push config -q || die "docker compose rejects the push profile"
}

PM4() { # flisk up: php healthy, / redirects to /login
  log "PM4 flisk up and plMail answers over HTTPS"
  cd "$DIR"
  export HTTP_PORT="$HTTP_PORT_E2E" HTTPS_PORT="$HTTPS_PORT_E2E" HTTP3_PORT="$HTTPS_PORT_E2E"
  start_stack "$STACK"
  poll_until "plMail answers / with a redirect to /login" "$READY_TIMEOUT" php_redirects_to_login
  local worker
  worker="$(running_container worker)"
  [ -n "$worker" ] || die "the worker is not running"
}

e2e_main "$@"
