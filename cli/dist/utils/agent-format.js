// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/** "12s ago", "5m ago", "3h ago", "2d ago"; "-" when the agent sent no time. */
export function formatAge(iso, now = Date.now()) {
    if (!iso)
        return "-";
    const at = Date.parse(iso);
    if (Number.isNaN(at))
        return iso;
    const seconds = Math.max(0, Math.round((now - at) / 1000));
    if (seconds < 60)
        return `${seconds}s ago`;
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86_400)
        return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86_400)}d ago`;
}
