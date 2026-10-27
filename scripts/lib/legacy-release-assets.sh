#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
#
# Flisk 1.4.5 and older binaries upgrade from tdk-* asset names (tdk-darwin-arm64, tdk-cli-engine.tar.gz, ...) and
# require a checksums.txt entry for the binary. Publishing byte-identical tdk-* copies next to the flisk-* assets lets
# `flisk upgrade` on those binaries reach the current release instead of failing with a 404.

# shellcheck disable=SC2034 # read by release-binaries.sh
readonly LEGACY_RELEASE_ASSETS=(
  tdk-linux-amd64
  tdk-linux-arm64
  tdk-darwin-amd64
  tdk-darwin-arm64
  tdk-windows-amd64.exe
  tdk-cli-engine.tar.gz
)

# Copies each flisk-* asset in DIR to its tdk-* name and appends the copies to DIR/checksums.txt.
add_legacy_release_assets() {
  local dir="$1"
  local legacy
  for legacy in "${LEGACY_RELEASE_ASSETS[@]}"; do
    cp "${dir}/flisk-${legacy#tdk-}" "${dir}/${legacy}"
  done
  (
    cd "${dir}" || exit 1
    shasum -a 256 "${LEGACY_RELEASE_ASSETS[@]}" >> checksums.txt
  )
}
