#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Legacy installer URL for the Flisk CLI.
#
# The official installer is https://flisk.sh/install.sh. It
# installs the prebuilt `flisk` binary plus its bundled engine, verified
# against the release checksums, with no Node or Bun required. This script
# used to clone this repo and `bun link` it instead; it now hands off to the
# official installer so old
#   curl -fsSL https://raw.githubusercontent.com/flisk-sh/flisk/main/install.sh | bash
# commands keep working and every install method gets the same result.
#
# To work on Flisk itself, clone the repo instead (see CONTRIBUTING.md).

set -euo pipefail

# Pinned to a commit of flisk-sh/flisk-sh.github.io and verified
# against the SHA-256 of that exact install.sh before it is executed.
readonly OFFICIAL_INSTALLER="https://raw.githubusercontent.com/flisk-sh/flisk-sh.github.io/ed5478b2e868252c7146e484c5fd4e6211ec3a55/install.sh"
readonly OFFICIAL_INSTALLER_SHA256="c44d35f099306369a32fa5569b78d637035df04377bd43ff425efbc55078b836"

echo "Using the official Flisk installer: ${OFFICIAL_INSTALLER}" >&2
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
