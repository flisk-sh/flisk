#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Checks an idle generated backend container against the runtime footprint budget
# (openspec: runtime-container-footprint): one Bun process, <= 64 MiB, < 2% CPU.
#
# Usage: scripts/measure-idle-footprint.sh <container> [sample_seconds]
set -euo pipefail

container="${1:?usage: $0 <container> [sample_seconds]}"
sample_seconds="${2:-60}"
max_mem_mib="${MAX_MEM_MIB:-64}"
max_cpu_pct="${MAX_CPU_PCT:-2}"

echo "Waiting for ${container} to be healthy..."
for _ in $(seq 1 90); do
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")"
  [ "$health" = "healthy" ] || [ "$health" = "none" ] && break
  sleep 2
done
if [ "$health" != "healthy" ] && [ "$health" != "none" ]; then
  echo "FAIL: ${container} is ${health}, not healthy" >&2
  exit 1
fi

bun_processes="$(docker top "$container" -o args | tail -n +2 | grep -c '^bun ' || true)"
echo "Bun processes: ${bun_processes}"
docker top "$container" -o pid,rss,args | sed 's/^/  /'

to_mib() {
  awk -v v="$1" 'BEGIN {
    n = v + 0
    if (v ~ /GiB$/) n *= 1024
    else if (v ~ /KiB$/) n /= 1024
    else if (v ~ /[0-9]B$/) n /= 1048576
    printf "%.2f", n
  }'
}

samples=0 cpu_total=0 mem_peak=0
end=$((SECONDS + sample_seconds))
while [ "$SECONDS" -lt "$end" ]; do
  line="$(docker stats --no-stream --format '{{.CPUPerc}} {{.MemUsage}}' "$container")"
  cpu="${line%%\%*}"
  mem="$(to_mib "$(echo "$line" | awk '{print $2}')")"
  cpu_total="$(awk -v a="$cpu_total" -v b="$cpu" 'BEGIN { printf "%.4f", a + b }')"
  mem_peak="$(awk -v a="$mem_peak" -v b="$mem" 'BEGIN { print (b > a ? b : a) }')"
  samples=$((samples + 1))
  sleep 5
done
cpu_avg="$(awk -v t="$cpu_total" -v n="$samples" 'BEGIN { printf "%.2f", t / n }')"

echo "Samples: ${samples} over ${sample_seconds}s | peak memory: ${mem_peak} MiB (max ${max_mem_mib}) | avg CPU: ${cpu_avg}% (max <${max_cpu_pct}%)"

failed=0
[ "$bun_processes" -eq 1 ] || { echo "FAIL: expected 1 Bun process, found ${bun_processes}" >&2; failed=1; }
awk -v m="$mem_peak" -v max="$max_mem_mib" 'BEGIN { exit !(m <= max) }' || { echo "FAIL: memory over budget" >&2; failed=1; }
awk -v c="$cpu_avg" -v max="$max_cpu_pct" 'BEGIN { exit !(c < max) }' || { echo "FAIL: CPU over budget" >&2; failed=1; }
[ "$failed" -eq 0 ] && echo "PASS: ${container} is within the idle footprint budget"
exit "$failed"
