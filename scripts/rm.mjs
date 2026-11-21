#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Cross-platform replacement for `rm -rf` in npm scripts. Paths are resolved from npm's working directory, so a package
// can clean its own `dist` with `node ../scripts/rm.mjs dist`. Missing paths are ignored, like `rm -f`.
import { rmSync } from "node:fs";
import { parse, resolve } from "node:path";

const targets = process.argv.slice(2);

if (targets.length === 0) {
  console.error("usage: node scripts/rm.mjs <path> [path...]");
  process.exit(2);
}

try {
  const cwd = process.cwd();
  for (const target of targets) {
    const path = resolve(cwd, target);
    if (path === cwd || path === parse(path).root) {
      throw new Error(`refusing to remove the working directory or a filesystem root: ${target}`);
    }
    rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
} catch (error) {
  console.error(`rm: ${error.message}`);
  process.exit(1);
}
