#!/bin/bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Re-record docs/assets/demo.svg, the animated terminal demo shown in README.md.
#
# Needs `flisk` on PATH and termtosvg (pip install termtosvg). Run from the
# repo root:  scripts/record-demo.sh
# The demo runs real flisk commands in a temporary folder that is shown as
# ~/my-shop. `flisk up` is only mentioned, because it needs Docker and Tilt.
set -euo pipefail

if [[ "${1:-}" != "--play" ]]; then
  cast="$(mktemp -d)/demo.cast"
  # `script` gives termtosvg a real terminal even when run from CI or an IDE.
  script -qec "termtosvg record '$cast' -c '$0 --play' -g 92x30" /dev/null >/dev/null
  termtosvg render "$cast" docs/assets/demo.svg -t window_frame -M 3000
  exit 0
fi

export FORCE_COLOR=1
dir="$(mktemp -d)/my-shop"
mkdir -p "$dir" && cd "$dir"

tidy() { sed -u "s#$dir#~/my-shop#g"; }
type_cmd() {
  printf '\033[35m~/my-shop $\033[0m '
  for ((i = 0; i < ${#1}; i++)); do printf '%s' "${1:$i:1}"; sleep 0.035; done
  sleep 0.5; printf '\n'
}

clear; sleep 0.5
type_cmd "flisk project --yes"
flisk project --yes 2>&1 | tidy | grep --line-buffered -E "Initializing|✓ Created: .tdk/project|Generated: .tdk/.tdk-out/Tiltfile|docker-compose|✅"
sleep 1.8
type_cmd "flisk resource orders-api --type backend --stack shop"
printf 'y\n' | flisk resource orders-api --type backend --stack shop 2>&1 | tidy | grep --line-buffered -E "Port:|Path:|Dockerfile|backend source|test file|✅"
sleep 1.8
type_cmd "flisk resource shop-web --type frontend --stack shop"
printf 'y\n' | flisk resource shop-web --type frontend --stack shop 2>&1 | tidy | grep --line-buffered -E "Port:|Path:|✅"
sleep 1.8
type_cmd "flisk stacks --services"
flisk stacks --services 2>&1 | tidy | grep -v '^\s*$'
sleep 1.2
printf '\n\033[2m# next: flisk up shop  (Tilt builds, runs and hot-reloads the whole stack)\033[0m\n'
sleep 4
