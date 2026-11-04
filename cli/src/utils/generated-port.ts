// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

/**
 * Generated-code lines that declare `name` from PORT: the value when it is a whole
 * number from 1 to 65535, otherwise 3000. Every generated backend uses this one rule,
 * so `PORT=abc` or `PORT=70000` falls back to 3000 instead of becoming NaN.
 */
export function portFromEnv(name = "port", indent = ""): string {
  return [
    "const envPort = Number(process.env.PORT);",
    `const ${name} = Number.isInteger(envPort) && envPort >= 1 && envPort <= 65535 ? envPort : 3000;`,
  ]
    .map((line) => indent + line)
    .join("\n");
}
