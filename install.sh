#!/usr/bin/env bash
# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# Installs the Flisk CLI from npm.
#
#   curl -fsSL https://raw.githubusercontent.com/flisk-sh/tdk-cli-core/main/install.sh | bash
#
# The package is published as `flisk` and installs the `flisk` command (the
# `tdk` and `tdk-cli` aliases stay available for older muscle memory).
#
# To work on Flisk itself, clone the repo instead (see CONTRIBUTING.md).

set -euo pipefail

readonly PACKAGE="flisk"

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required to install the Flisk CLI (Node.js 22.12+)." >&2
  echo "Install Node.js from https://nodejs.org and rerun this script." >&2
  exit 1
fi

echo "Installing ${PACKAGE} from npm..." >&2
npm install -g "${PACKAGE}@latest"

echo "Installed: $(command -v flisk || echo flisk)" >&2
flisk --version
