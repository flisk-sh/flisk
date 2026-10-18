#!/usr/bin/env bash
# Bundles failure evidence from one E2E job (#1382): Docker container status and logs, Tilt resource state, `tdk doctor`
# output, and the logs and generated project files under the given source directories. Writes <out-dir>/manifest.json
# beside them. The workflow uploads <out-dir> only when the job failed, for 7 days.
#
# Usage: scripts/e2e/collect-evidence.sh <out-dir> <case label> [source dir...]
#
# Bounds: each log keeps its last 500 lines, each generated file is skipped above 1 MB, and the whole bundle stops
# adding files at 20 MB (the manifest lists what was skipped). Text is redacted before it is written: home directories,
# GitHub and npm tokens, and KEY=value pairs whose name suggests a secret.
set -uo pipefail

out="${1:?usage: collect-evidence.sh <out-dir> <case label> [source dir...]}"
label="${2:?usage: collect-evidence.sh <out-dir> <case label> [source dir...]}"
shift 2

runner_temp="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
if [ "$#" -eq 0 ]; then
  set -- "$runner_temp/tdk-e2e" "$runner_temp/shop" "$runner_temp/tdk-cold-start" "$runner_temp/smoke-records" "$runner_temp/tdk-byo-python-boot"
fi

budget=$((20 * 1024 * 1024))
max_generated=$((1024 * 1024))
max_containers=60
max_source_files=400

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$out/logs" "$out/generated" "$out/tilt" "$out/docker"
: > "$work/included.tsv"
: > "$work/skipped.tsv"
total=0

redact() {
  sed -E \
    -e "s#${HOME:-/nonexistent}#~#g" \
    -e 's#/(Users|home)/[^/ "]+#/\1/<user>#g' \
    -e 's#(gh[pousr]_|github_pat_)[A-Za-z0-9_]+#<redacted-token>#g' \
    -e 's#npm_[A-Za-z0-9]{20,}#<redacted-token>#g' \
    -e 's#([A-Za-z0-9_]*(TOKEN|SECRET|PASSWORD|LICENSE_KEY|API_KEY|KEY)[A-Za-z0-9_]*)=[^ "]+#\1=<redacted>#g'
}

# commit <tmp file> <bundle-relative path> <kind>: moves redacted content into the bundle if the budget allows.
commit() {
  local tmp="$1" rel="$2" bytes
  bytes="$(wc -c < "$tmp" | tr -d ' ')"
  if [ $((total + bytes)) -gt "$budget" ]; then
    printf '%s\t%s\n' "$rel" "over the 20 MB bundle budget" >> "$work/skipped.tsv"
    return 0
  fi
  mkdir -p "$(dirname "$out/$rel")"
  mv "$tmp" "$out/$rel"
  total=$((total + bytes))
  printf '%s\t%s\n' "$rel" "$bytes" >> "$work/included.tsv"
}

# Docker: status first, so the manifest can say which service stopped.
if command -v docker >/dev/null 2>&1; then
  docker ps -a --format '{{json .}}' > "$work/ps.jsonl" 2>/dev/null || : > "$work/ps.jsonl"
  redact < "$work/ps.jsonl" > "$work/ps.redacted" && commit "$work/ps.redacted" docker/containers.jsonl
  docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.CreatedSince}}' 2>/dev/null | head -50 > "$work/images"
  redact < "$work/images" > "$work/images.redacted" && commit "$work/images.redacted" docker/images.txt
  count=0
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    count=$((count + 1))
    if [ "$count" -gt "$max_containers" ]; then
      printf '%s\t%s\n' "docker logs for remaining containers" "more than $max_containers containers" >> "$work/skipped.tsv"
      break
    fi
    docker logs --tail 500 "$name" > "$work/dlog" 2>&1
    redact < "$work/dlog" > "$work/dlog.redacted"
    commit "$work/dlog.redacted" "logs/docker-$name.log"
  done < <(docker ps -a --format '{{.Names}}' 2>/dev/null)
fi

# Tilt: resource state (the Tilt log stream is read from the source directories, where tdk up wrote it).
if command -v tilt >/dev/null 2>&1; then
  tilt get uiresources -o wide 2>&1 | head -200 > "$work/tilt" || true
  redact < "$work/tilt" > "$work/tilt.redacted" && commit "$work/tilt.redacted" tilt/uiresources.txt
fi

# tdk: doctor and status are read-only checks, so they are safe on a failed run.
if command -v tdk >/dev/null 2>&1; then
  tdk doctor --json 2>&1 | tail -n 500 > "$work/doctor" || true
  redact < "$work/doctor" > "$work/doctor.redacted" && commit "$work/doctor.redacted" logs/tdk-doctor.json
  tdk status --json 2>&1 | tail -n 500 > "$work/status" || true
  redact < "$work/status" > "$work/status.redacted" && commit "$work/status.redacted" logs/tdk-status.json
fi

# Source directories: logs are tailed; generated project files are copied up to a size cap. .env files and dependency
# and git directories are never copied.
files=0
for dir in "$@"; do
  [ -d "$dir" ] || continue
  while IFS= read -r file; do
    files=$((files + 1))
    if [ "$files" -gt "$max_source_files" ]; then
      printf '%s\t%s\n' "$dir" "more than $max_source_files files; the rest were not collected" >> "$work/skipped.tsv"
      break 2
    fi
    rel="${file#"$dir"/}"
    safe="$(printf '%s' "$(basename "$dir")/$rel" | tr '/' '_')"
    case "$file" in
      *.log|*.out)
        tail -n 500 "$file" > "$work/src" 2>/dev/null ;;
      *)
        if [ "$(wc -c < "$file" | tr -d ' ')" -gt "$max_generated" ]; then
          printf '%s\t%s\n' "$file" "over 1 MB" >> "$work/skipped.tsv"
          continue
        fi
        cp "$file" "$work/src" ;;
    esac
    redact < "$work/src" > "$work/src.redacted"
    commit "$work/src.redacted" "generated/$safe"
  done < <(find "$dir" \( -name node_modules -o -name .git -o -name .tdk-cache \) -prune -o -type f \
    \( -name '*.log' -o -name '*.out' -o -name '*.json' -o -name '*.yml' -o -name '*.yaml' -o -name 'Tiltfile' -o -name '*.star' -o -name '*.md' \) \
    ! -name '.env*' ! -name '*.env' -print 2>/dev/null)
done

created="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
run_url="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-local/local}/actions/runs/${GITHUB_RUN_ID:-0}"
services="$(jq -s '.' "$work/ps.jsonl" 2>/dev/null || echo '[]')"
included="$(jq -Rn '[inputs | select(length > 0) | split("\t") | {path: .[0], bytes: (.[1] | tonumber)}]' "$work/included.tsv")"
skipped="$(jq -Rn '[inputs | select(length > 0) | split("\t") | {path: .[0], reason: .[1]}]' "$work/skipped.tsv")"
jq -n \
  --arg run_url "$run_url" \
  --arg case "$label" \
  --arg created "$created" \
  --arg job "${GITHUB_JOB:-local}" \
  --argjson total "$total" \
  --argjson budget "$budget" \
  --argjson services "$services" \
  --argjson included "$included" \
  --argjson skipped "$skipped" \
  '{run_url: $run_url, case: $case, job: $job, created: $created,
    bytes_total: $total, bytes_budget: $budget,
    services: $services, included: $included, skipped: $skipped}' > "$out/manifest.json"

echo "Failure evidence for $label: $(wc -l < "$work/included.tsv" | tr -d ' ') files, $total bytes, in $out"
