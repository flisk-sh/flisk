#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# Lifecycle smoke test for the packed CLI tarball (#1384): install the previous
# published version, upgrade to the packed tarball, check `tdk --version` against
# cli/package.json, run the reinstalled `tdk --help`, uninstall, and confirm `tdk` is gone.
#
# Meant for a clean machine or container with Node 22 and no Tilt or Docker
# project (see .github/workflows/package-lifecycle-smoke.yml). Everything lands
# under a private HOME, npm prefix and cache, so it never touches the host's
# global install.
#   usage: bash scripts/package-lifecycle-smoke.sh <tarball> <cli/package.json>
set -euo pipefail

readonly PACKAGE="@tdk-landscape/tdk-cli-core"

if [ "$#" -ne 2 ]; then
  echo "usage: bash scripts/package-lifecycle-smoke.sh <tarball> <cli/package.json>" >&2
  exit 2
fi
tarball="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
package_json="$2"
if [ ! -f "$tarball" ]; then
  echo "packed tarball not found: $tarball" >&2
  exit 1
fi

expected="$(node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).version)' "$package_json")"
if [ -z "$expected" ]; then
  echo "no version in $package_json" >&2
  exit 1
fi

work_dir="$(mktemp -d -t tdk-lifecycle.XXXXXX)"
cleanup() {
  status=$?
  trap - EXIT
  rm -rf "$work_dir"
  exit "$status"
}
trap cleanup EXIT

export HOME="$work_dir/home"
export npm_config_prefix="$work_dir/prefix"
export npm_config_cache="$work_dir/npm-cache"
export npm_config_update_notifier=false
mkdir -p "$HOME"
export PATH="$work_dir/prefix/bin:$PATH"

step() {
  echo
  echo "== $*"
}

# Reads `tdk --version` from the PATH and fails unless it prints exactly $1.
check_installed_version() {
  local want="$1"
  local got
  hash -r
  got="$(tdk --version)"
  if [ "$got" != "$want" ]; then
    echo "installed tdk reports '$got', expected '$want'" >&2
    exit 1
  fi
  echo "tdk --version: $got"
}

# The newest stable version published before $expected. Upgrading from it
# exercises the path a real user takes from the last release.
previous="$(npm view "$PACKAGE" versions --json | node -e '
  const expected = process.argv[1];
  const versions = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
  const parse = (v) => v.split(".").map(Number);
  const compare = (a, b) => {
    const x = parse(a);
    const y = parse(b);
    for (let i = 0; i < 3; i++) {
      if (x[i] !== y[i]) return x[i] - y[i];
    }
    return 0;
  };
  const older = versions
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v) && compare(v, expected) < 0)
    .sort(compare);
  if (older.length === 0) process.exit(1);
  process.stdout.write(older[older.length - 1]);
' "$expected")"
echo "packed version: $expected"
echo "previous published version: $previous"

step "Install previous published version $previous"
npm install --global "$PACKAGE@$previous"
check_installed_version "$previous"

step "Upgrade to the packed tarball $(basename "$tarball")"
npm install --global "$tarball"
check_installed_version "$expected"

step "Run the reinstalled CLI"
# `tdk project` and `tdk up` stop at the machine checks (Docker, Compose, Tilt,
# Bun) in this container, so only the command surface is exercised here. The
# fresh `tdk up` check after reinstall needs a runner with Docker and Tilt.
tdk --help >/dev/null
echo "tdk --help ok; tdk project and tdk up were not run (no Docker, Tilt or Bun)"

step "Uninstall"
npm uninstall --global "$PACKAGE"
hash -r
if command -v tdk >/dev/null 2>&1; then
  echo "tdk is still on PATH after uninstall: $(command -v tdk)" >&2
  exit 1
fi
if [ -e "$work_dir/prefix/bin/tdk" ]; then
  echo "$work_dir/prefix/bin/tdk still exists after uninstall" >&2
  exit 1
fi
echo "tdk is gone"

echo
echo "✅ Packed CLI lifecycle smoke passed (install, version, upgrade, uninstall)"
