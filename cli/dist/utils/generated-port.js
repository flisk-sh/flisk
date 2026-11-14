// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Generated-code lines that declare `name` from PORT: the value when it is a whole
 * number from 1 to 65535, otherwise `fallback` (default 3000). Each line is prefixed
 * with `indent`. Throws if `fallback` is not an integer from 1 to 65535.
 */
export function portFromEnv(name = "port", indent = "", fallback = 3000) {
    if (!Number.isInteger(fallback) || fallback < 1 || fallback > 65535) {
        throw new RangeError("Port fallback must be an integer from 1 to 65535");
    }
    return [
        "const envPort = Number(process.env.PORT);",
        `const ${name} = Number.isInteger(envPort) && envPort >= 1 && envPort <= 65535 ? envPort : ${fallback};`,
    ]
        .map((line) => indent + line)
        .join("\n");
}
