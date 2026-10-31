#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Enigma 36: one project of 36 resources drawn at random from every type `flisk resource` creates (each backend framework and
# language, each frontend framework, worker, mcp, agent with each durability, database, bring-your-own and sdk), dealt over six
# stacks and booted with one `flisk up`. Each night draws a new combination; the seed is printed first, so any failure replays
# with E2E_SEED=<seed>. plan.mjs draws the plan and checks it on the diagonal board before anything is scaffolded.
#
#   tests/e2e/scale/enigma36/run.sh all                          a fresh random draw, every case, then cleanup
#   E2E_SEED=1936 tests/e2e/scale/enigma36/run.sh all            replay one draw
#   ENIGMA_COUNT=12 tests/e2e/scale/enigma36/run.sh K1 K2 K3     a smaller draw for a laptop (the diagonal board still applies)
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
# shellcheck source=../../resource-types/common.sh
source "$SUITE_DIR/../../resource-types/common.sh"
e2e_init enigma36 enigma36
PLAN="$SUITE_ROOT/plan.json"
COUNT="${ENIGMA_COUNT:-36}"

# The plan K1 drew, drawn now when a case runs on its own. E2E_SEED pins it; otherwise the seed is random.
load_plan() {
  if [ ! -f "$PLAN" ] || { [ -n "${E2E_SEED:-}" ] && [ "$(jq -r .seed "$PLAN")" != "$E2E_SEED" ]; }; then
    node "$SUITE_DIR/plan.mjs" --count "$COUNT" ${E2E_SEED:+--seed "$E2E_SEED"} >"$PLAN" || die "plan.mjs could not draw a plan"
  fi
}
entries() { jq -c '.entries[]' "$PLAN"; } # one JSON object per line: name, kind, variant, stack, args
field() { jq -r ".$2" <<<"$1"; }          # <entry json> <field>
# The names `diagnostics` collects container logs for. No mapfile: macOS still ships bash 3.2.
plan_names() { RESOURCES=(); local n; while IFS= read -r n; do RESOURCES+=("$n"); done < <(jq -r '.entries[].name' "$PLAN"); }
RESOURCES=()
[ -f "$PLAN" ] && plan_names

http_ok() { local code; code="$(traefik_request "$1" "$2" -o /dev/null -w '%{http_code}')"; [[ "$code" == 2?? ]]; } # <resource> <path>
worker_started() { local c; c="$(running_container "$1")"; [ -n "$c" ] && docker logs "$c" 2>&1 | grep -q "$1 worker started"; }
container_running() { [ -n "$(running_container "$1")" ]; }
all_listed() { # every entry of the plan is in flisk status with its type
  status_json | jq -e --slurpfile plan "$PLAN" \
    '[.data.resources[] | "\(.name)=\(.type)"] as $have | all($plan[0].entries[]; ("\(.name)=\(.kind)") as $want | $have | index($want))' >/dev/null
}

# The observable contract of one entry, as a command poll_until can retry.
contract() { # <entry json>
  local name; name="$(field "$1" name)"
  case "$(field "$1" kind)" in
    backend | mcp | bring-your-own) http_ok "$name" /health ;;
    agent) http_ok "$name" /ready ;;
    frontend) http_ok "$name" / ;;
    worker) worker_started "$name" ;;
    database) container_running "$name" ;;
    sdk) common_listed "$name" sdk ;;
  esac
}

# A bring-your-own resource is traefik/whoami told to listen on the port flisk assigned; whoami answers /health with 200.
scaffold_byo() { # <name> <stack>
  run "scaffold-$1" resource "$1" --type bring-your-own --stack "$2" --dockerfile Dockerfile --json
  [ "$RC" -eq 0 ] || die "flisk resource $1 --type bring-your-own exited $RC"
  local port dir
  port="$(jq -r .data.port "$OUT/scaffold-$1.out")"
  dir="$DIR/$(jq -r .data.path "$OUT/scaffold-$1.out")"
  printf 'FROM traefik/whoami:v1.10\nCMD ["--port", "%s"]\n' "$port" >"$dir/Dockerfile"
}

# An sdk is a package with a build script, registered from its own service.json (as in tests/e2e/resource-types/sdk).
scaffold_sdk() { # <name> <stack>
  local pkg="packages/$1"
  mkdir -p "$DIR/$pkg"
  printf '{"appName":"%s","appType":"sdk"}\n' "$1" >"$DIR/$pkg/service.json"
  printf '{"name":"%s","version":"0.0.0","type":"module","scripts":{"dev":"true","build":"true"}}\n' "$1" >"$DIR/$pkg/package.json"
  run "scaffold-$1" resource "$1" --type sdk --path "$pkg" --stack "$2" --json
  [ "$RC" -eq 0 ] || die "flisk resource $1 --type sdk exited $RC"
}

K1() { # draw the plan, print the seed and the board
  log "K1 draw $COUNT resources"
  rm -f "$PLAN"
  load_plan
  plan_names
  echo "seed $(jq -r .seed "$PLAN")   replay: E2E_SEED=$(jq -r .seed "$PLAN") tests/e2e/scale/enigma36/run.sh all"
  jq -r '.entries[] | [.name, .kind, .stack] | @tsv' "$PLAN" | column -t
  jq -r '.entries | group_by(.kind) | map("\(.[0].kind) \(length)") | join(", ")' "$PLAN"
}

K2() { # one project, every drawn resource scaffolded into it with flisk resource
  load_plan
  log "K2 scaffold $(jq '.entries | length' "$PLAN") resources in one project"
  rm -rf "$DIR"; mkdir -p "$DIR"
  (cd "$DIR" && git init -q .)
  run scaffold-project project --yes
  [ "$RC" -eq 0 ] || die "flisk project --yes exited $RC"
  local e name kind stack a args
  while read -r e; do
    name="$(field "$e" name)"; kind="$(field "$e" kind)"; stack="$(field "$e" stack)"
    case "$kind" in
      bring-your-own) scaffold_byo "$name" "$stack" ;;
      sdk) scaffold_sdk "$name" "$stack" ;;
      *)
        args=(); while IFS= read -r a; do args+=("$a"); done < <(jq -r '.args[]' <<<"$e")
        run "scaffold-$name" resource "$name" --type "$kind" --stack "$stack" ${args[@]+"${args[@]}"} --json
        [ "$RC" -eq 0 ] || die "flisk resource $name --type $kind ${args[*]-} exited $RC"
        ;;
    esac
    assert check "$OUT/scaffold-$name.out" "j.errors.length === 0 && j.data.name === '$name' && j.data.type === '$kind'" "$name scaffolded as $kind"
  done < <(entries)
}

K3() { # the generated project is consistent before anything boots
  log "K3 flisk config verify on the drawn project"
  [ -d "$DIR" ] || K2
  run k3-verify config verify --json
  [ "$RC" -eq 0 ] || die "flisk config verify exited $RC"
  assert check "$OUT/k3-verify.out" "j.errors.length === 0" "flisk config verify reports no errors"
}

K4() { # one flisk up for all six stacks, then every resource is listed with its type
  load_plan
  log "K4 flisk up, then flisk status lists every drawn resource"
  [ -d "$DIR" ] || K2
  : >"$DIR/up.log"
  (cd "$DIR" && nohup flisk up >>"$DIR/up.log" 2>&1 &)
  poll_until "all $(jq '.entries | length' "$PLAN") resources listed with their types" "$READY_TIMEOUT" all_listed
  run k4-status status --json
  assert check "$OUT/k4-status.out" "j.errors.length === 0" "flisk status --json has no errors"
}

K5() { # each resource keeps its type's contract while all the others run beside it
  load_plan
  log "K5 every resource answers its type's contract"
  local e name
  while read -r e; do
    name="$(field "$e" name)"
    poll_until "$name ($(field "$e" kind), $(field "$e" variant)) meets its contract" "$READY_TIMEOUT" contract "$e"
    echo "ok $name"
  done < <(entries)
}

K6() { # restart one HTTP resource the seed picks; it comes back and a neighbour never went down
  load_plan
  local e http target neighbour before
  http=(); while IFS= read -r e; do http+=("$e"); done < <(jq -c '.entries[] | select(.kind == "backend" or .kind == "mcp" or .kind == "agent")' "$PLAN")
  [ "${#http[@]}" -ge 2 ] || { echo "K6 skipped: the draw has fewer than two HTTP resources"; return 0; }
  target="${http[$(($(jq .seed "$PLAN") % ${#http[@]}))]}"
  neighbour="${http[$((($(jq .seed "$PLAN") + 1) % ${#http[@]}))]}"
  log "K6 restart $(field "$target" name); $(field "$neighbour" name) stays up"
  before="$(running_container "$(field "$target" name)")"
  [ -n "$before" ] || die "$(field "$target" name) has no running container before the restart"
  common_restart "$(field "$target" name)" "$before" "$(field "$target" name) meets its contract again" contract "$target"
  contract "$neighbour" || die "$(field "$neighbour" name) stopped answering while $(field "$target" name) restarted"
}

K7() { # restarting a resource the plan never drew is one error envelope, with the stack still up
  log "K7 flisk restart of an undrawn resource prints one error envelope"
  common_error_envelope TILT_TRIGGER_FAILED restart e99-never-drawn --json
}

e2e_main "$@"
