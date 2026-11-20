#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// npm runs `prepare` on a local install, including installs from a GitHub URL. `prepare` must never block installation:
// a temporary checkout has no .git directory, and a source tree may ship no hooks. Hooks are only configured when both
// a Git checkout and the repository's .githooks directory are present.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function hasGitDirectory() {
  const result = spawnSync("git", ["-C", ROOT_DIR, "rev-parse", "--git-dir"], {
    stdio: "ignore",
    windowsHide: true,
  });
  return result.status === 0;
}

function hasHooksDirectory() {
  try {
    return statSync(join(ROOT_DIR, ".githooks")).isDirectory();
  } catch {
    return false;
  }
}

try {
  if (hasGitDirectory() && hasHooksDirectory()) {
    spawnSync("git", ["-C", ROOT_DIR, "config", "core.hooksPath", ".githooks"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
} catch {
  // Installing hooks is best-effort; never make `npm install` fail because of them.
} finally {
  process.exit(0);
}
