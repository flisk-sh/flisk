#!/usr/bin/env node
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function nodeTooOld(version) {
  const [major = 0, minor = 0] = String(version)
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  return (
    !Number.isFinite(major) || !Number.isFinite(minor) || major < 22 || (major === 22 && minor < 12)
  );
}

if (nodeTooOld(process.versions.node)) {
  console.error(
    "TDK CLI needs Node.js 22.12+ (current: " +
      process.versions.node +
      ").\n" +
      "This is the first cold-npx failure. Bun/Prisma/NATS are not involved yet.\n" +
      "Install Node 22.12+ and rerun.",
  );
  process.exit(1);
}

// dist-bundle/ (ink/react/chalk inlined) exists only in a packed npm package;
// a git checkout runs the committed dist/ instead.
const bundledCliPath = join(__dirname, "..", "dist-bundle", "cli.js");
const cliPath = existsSync(bundledCliPath)
  ? bundledCliPath
  : join(__dirname, "..", "dist", "cli.js");

import(pathToFileURL(cliPath).href).catch((err) => {
  console.error("Failed to start TDK:", err);
  process.exit(1);
});
