#!/usr/bin/env bash
# Copyright (c) 2026 TDK Landscape contributors
# SPDX-License-Identifier: MIT
# Legacy installer URL for the TDK CLI.
#
# The official installer is https://flisk-sh.github.io/tdk-landscape.github.io/install.sh. It
# installs the prebuilt `tdk` binary plus its bundled engine, verified
# against the release checksums, with no Node or Bun required. This script
# used to clone this repo and `bun link` it instead; it now hands off to the
# official installer so old
#   curl -fsSL https://raw.githubusercontent.com/flisk-sh/tdk-cli-core/main/install.sh | bash
# commands keep working and every install method gets the same result.
#
# To work on TDK itself, clone the repo instead (see CONTRIBUTING.md).

set -euo pipefail

# Pinned to a commit of flisk-sh/tdk-landscape.github.io and verified
# against the SHA-256 of that exact install.sh before it is executed.
readonly OFFICIAL_INSTALLER="https://raw.githubusercontent.com/flisk-sh/tdk-landscape.github.io/71ed55f1aca54f0a4c2fd45236c59228803725b4/install.sh"
readonly OFFICIAL_INSTALLER_SHA256="add9c92c79947116d2845ecdecc2e0643e84b5aae31e6dd807dee0fe67f11fb0"

echo "Using the official TDK installer: ${OFFICIAL_INSTALLER}" >&2
installer_tmp="$(mktemp)"
trap 'rm -f "$installer_tmp"' EXIT
curl -fsSL "$OFFICIAL_INSTALLER" -o "$installer_tmp"

if command -v sha256sum >/dev/null 2>&1; then
  actual_sha256="$(sha256sum "$installer_tmp" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual_sha256="$(shasum -a 256 "$installer_tmp" | awk '{print $1}')"
else
  echo "Error: sha256sum or shasum is required to verify the official installer." >&2
  exit 1
fi

if [[ "$actual_sha256" != "$OFFICIAL_INSTALLER_SHA256" ]]; then
  echo "Error: official installer checksum mismatch; refusing to execute it." >&2
  exit 1
fi

sh "$installer_tmp"
