#!/usr/bin/env bash
# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT

set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# npm runs `prepare` when installing from a GitHub URL, but its temporary
# checkout does not include the .git directory. Hooks are only needed in a
# developer checkout, so leave package installation untouched.
if ! git -C "${ROOT_DIR}" rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

git -C "${ROOT_DIR}" config core.hooksPath .githooks
