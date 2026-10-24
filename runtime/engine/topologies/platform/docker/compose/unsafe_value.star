# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Defence in depth for values written into generated Compose / Traefik YAML.
# parser.star already refuses these values, but a caller that reaches a generator directly bypasses it.
# A line break is the only way to add a YAML key, so refuse it here too (GHSA-phgf-pww4-7jxc, #710).
# Keep in step with _LINE_BREAK_OR_CONTROL in engine/topologies/tilt/manifest/parser.star and
# hasLineBreakOrControl in cli/src/utils/service-manifest.ts. This file has no load() on purpose.
# =============================================================================

_LINE_BREAK_OR_CONTROL = [chr(i) for i in range(32)] + [chr(127), "\u0085", "\u2028", "\u2029"]

def reject_unsafe_value(value, field):
    """Return value unchanged, or fail() if a string contains a line break or control character.

    Non-strings (None, numbers) pass through. The value is not echoed, because it may contain the line break that makes it dangerous.
    """
    if type(value) != "string":
        return value
    for bad in _LINE_BREAK_OR_CONTROL:
        if bad in value:
            fail("MANIFEST ERROR: '{}' must not contain line breaks or control characters".format(field))
    return value