// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Pieces of the service.json checks that more than one validator module needs.
/**
 * A name in `secrets.required` / `secrets.optional` that `params` or `env` also sets to a literal: the literal reaches the
 * container, so the secret in `.env` is silently never used (an admin account created with "changeme").
 */
export const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Line breaks (including the Unicode ones YAML 1.1 honours) and other control characters. */
export function hasLineBreakOrControl(text) {
    for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        if (code < 0x20 || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029) {
            return true;
        }
    }
    return false;
}
/** Plain text that is safe inside a JSON (double-quoted YAML) string: no line break or control character. */
export const isPlainText = (value) => typeof value === "string" && !hasLineBreakOrControl(value);
