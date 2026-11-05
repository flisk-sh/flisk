#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Runs inside WSL2 Ubuntu on the hosted Windows runner (.github/workflows/e2e-windows-wsl2-docker.yml): installs the Docker
# Engine and makes it listen on tcp://127.0.0.1:2375 as well as its socket, so the Windows docker CLI, tilt.exe and Flisk can
# use it. Run as root. `diagnose` prints what the engine and systemd say, for the findings artifact.
#
# The engine must outlive the `wsl` call that starts it. A plain background dockerd dies with that call (run 42066922254:
# no log was ever written), so when WSL runs systemd (Ubuntu on WSL does by default) systemd owns dockerd; the setsid
# fallback is only for a distribution without systemd.
set -euo pipefail

override=/etc/systemd/system/docker.service.d/flisk-tcp.conf

diagnose() {
  echo "--- systemd: $(systemctl is-system-running 2>/dev/null || echo absent)"
  systemctl status docker.service docker.socket --no-pager 2>&1 | tail -n 40 || true
  journalctl -u docker.service -n 120 --no-pager 2>&1 || true
  echo "--- override"; cat "$override" 2>/dev/null || echo "(none)"
  echo "--- /var/log/dockerd.log"; tail -n 120 /var/log/dockerd.log 2>/dev/null || echo "(none)"
}

if [ "${1:-}" = diagnose ]; then
  diagnose
  exit 0
fi

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io

state="$(systemctl is-system-running 2>/dev/null || true)"
echo "systemd: ${state:-absent}"
case "$state" in
  running | degraded | starting | initializing)
    dockerd_bin="$(command -v dockerd)"
    mkdir -p "$(dirname "$override")"
    cat > "$override" <<CONF
[Service]
ExecStart=
ExecStart=$dockerd_bin -H fd:// -H tcp://127.0.0.1:2375 --containerd=/run/containerd/containerd.sock
CONF
    systemctl daemon-reload
    systemctl enable --now docker.socket
    systemctl restart docker.service
    ;;
  *)
    setsid nohup dockerd -H unix:///var/run/docker.sock -H tcp://127.0.0.1:2375 > /var/log/dockerd.log 2>&1 < /dev/null &
    ;;
esac

for _ in $(seq 1 30); do
  if docker -H tcp://127.0.0.1:2375 version --format '{{.Server.Version}}' 2> /dev/null; then
    echo "engine answers on tcp://127.0.0.1:2375 inside WSL"
    exit 0
  fi
  sleep 2
done
echo "engine did not answer on tcp://127.0.0.1:2375 inside WSL"
diagnose
exit 1
