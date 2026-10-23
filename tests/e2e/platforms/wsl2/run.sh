#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# The routed write smoke under WSL2 (moved from the retired wsl2-smoke workflow, #1300). The workflow runs each case in the
# wsl-bash shell of setup-wsl's Ubuntu 24.04 distro, one step per case, with the same logic as its old steps:
#   WS1 record uname and os-release, require a real WSL2 kernel, and copy the checkout to /root/tdk-ci
#   WS2 install Docker Engine and the Linux development tools (Node, Bun, Tilt)
#   WS3 build the candidate CLI from /root/tdk-ci and install it globally
#   WS4 run scripts/wsl2-smoke.sh through the routed write path
#   WS5 collect diagnostics into wsl2-evidence/ (the workflow's artifact)
#   WS6 run the one-command demo flow and confirm that what it started works
#
# The Docker backend is Docker Engine inside WSL2; Docker Desktop WSL integration is not tested here.
#
#   tests/e2e/platforms/wsl2/run.sh WS1 WS2    single cases, in order
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../lib/lib.sh
source "$SUITE_DIR/../../lib/lib.sh"
e2e_init wsl2 wsl2

# The shared e2e_cases reads suite.json with node, which this distro gets only in WS2. setup-wsl installs jq, so read the case ids with it.
e2e_cases() { jq -r '.cases | join(" ")' "$SUITE_DIR/suite.json"; }

WS1() { # record and require a real WSL2 kernel, then copy the checkout to /root/tdk-ci
  log "WS1 record and require a real WSL2 kernel"
  mkdir -p "$REPO_ROOT/wsl2-evidence"
  ln -s "$REPO_ROOT/wsl2-evidence" /root/tdk-evidence
  uname -a | tee /root/tdk-evidence/environment.log
  grep -qi 'microsoft-standard-WSL2' /proc/sys/kernel/osrelease
  cat /etc/os-release | tee -a /root/tdk-evidence/environment.log
  echo 'Docker backend: Docker Engine inside WSL2; Docker Desktop integration is not tested.' | tee -a /root/tdk-evidence/environment.log
  cp -a "$REPO_ROOT" /root/tdk-ci
  cd /root/tdk-ci
  git rev-parse HEAD | tee -a /root/tdk-evidence/environment.log
}

WS2() { # Docker Engine and the Linux development tools
  log "WS2 install Docker Engine and Linux development tools"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable' > /etc/apt/sources.list.d/docker.list
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  if ! docker info >/dev/null 2>&1; then
    nohup dockerd >/root/tdk-evidence/dockerd.log 2>&1 </dev/null &
  fi
  for _ in $(seq 1 30); do
    if docker info >/dev/null 2>&1; then break; fi
    sleep 2
  done
  docker info
  curl -fsSL https://nodejs.org/dist/v22.23.3/node-v22.23.3-linux-x64.tar.xz -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
  curl -fsSL -o /tmp/bun.zip https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/bun-linux-x64.zip
  echo "36368faef7527875d5ffa52e53cd48021741f2a83eb6208a8dd64068d422a913  /tmp/bun.zip" | sha256sum -c -
  python3 -m zipfile -e /tmp/bun.zip /tmp/bun-dl
  install -m 0755 /tmp/bun-dl/bun-linux-x64/bun /usr/local/bin/bun
  curl -fsSL -o tilt.tgz https://github.com/tilt-dev/tilt/releases/download/v0.37.8/tilt.0.37.8.linux.x86_64.tar.gz
  echo "e39513f958705d30524d55f68b1d46fbef2b46a0da568efd00e6383dee6be44f  tilt.tgz" | sha256sum -c -
  if [ "$(id -u)" -eq 0 ]; then tar -xzf tilt.tgz -C /usr/local/bin tilt; else sudo tar -xzf tilt.tgz -C /usr/local/bin tilt; fi
  rm -f tilt.tgz
  { node --version; bun --version; tilt version; docker version; docker compose version; } | tee -a /root/tdk-evidence/environment.log
}

WS3() { # build the candidate CLI from the copy and install it
  log "WS3 build and install the candidate CLI"
  cd /root/tdk-ci
  bun install --frozen-lockfile
  npm run build
  tarball="$(npm pack --silent | tail -1)"
  node scripts/install-global.mjs "./$tarball"
  flisk --version | tee -a /root/tdk-evidence/environment.log
}

WS4() { # the existing WSL2 routed write smoke
  log "WS4 routed write smoke"
  cd /root/tdk-ci
  bash scripts/wsl2-smoke.sh /root/tdk-smoke-work 2>&1 | tee /root/tdk-evidence/smoke.log
}

WS5() { # diagnostics for the artifact; runs even when a later step failed
  log "WS5 collect diagnostics"
  mkdir -p "$REPO_ROOT/wsl2-evidence"
  if [ -f /root/tdk-smoke-work/tdk-example/up.log ]; then
    cp /root/tdk-smoke-work/tdk-example/up.log "$REPO_ROOT/wsl2-evidence/up.log"
  fi
  docker ps -a >"$REPO_ROOT/wsl2-evidence/containers.log" 2>&1 || true
  uname -a >"$REPO_ROOT/wsl2-evidence/kernel.log"
}

WS6() { # the one-command demo flow, and the confirmation that what it started works
  log "WS6 the one-command demo flow"
  cd /root/tdk-ci
  bash scripts/wsl2-demo.sh /root/tdk-evidence 2>&1 | tee /root/tdk-evidence/demo-case.log
}

e2e_main "$@"
