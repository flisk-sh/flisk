#!/usr/bin/env bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
#
# Resolves a Flisk Tilt extension directory (engine, discovery, specs, ext) in a
# checkout. Prefers runtime/<name> and falls back to the flat <name> layout, the
# same order as cli/src/utils/runtime-layout.ts.

runtime_src_dir() {
  local root="$1" name="$2"
  if [[ -d "${root}/runtime/${name}" ]]; then
    echo "${root}/runtime/${name}"
  else
    echo "${root}/${name}"
  fi
}
