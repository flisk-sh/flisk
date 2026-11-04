// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { applyEnvAliases } from "./env-compat.js";

// Imported first in cli.ts so every later module sees the aliased variables.
const deprecated = applyEnvAliases(process.env);
const isJson = process.argv.includes("--json") || process.argv.includes("--json-legacy");
if (deprecated.length > 0 && process.env.FLISK_QUIET_DEPRECATIONS === undefined && !isJson) {
  console.error(
    `flisk: ${deprecated.join(", ")} ${deprecated.length > 1 ? "are" : "is"} deprecated; rename the TDK_ prefix to FLISK_ (set FLISK_QUIET_DEPRECATIONS=1 to silence).`,
  );
}
