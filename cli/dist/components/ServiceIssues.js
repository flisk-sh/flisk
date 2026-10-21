import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import { useTUITheme } from "./ui-theme.js";
/** One line per service that is not ready and has a reason, so a failed dependency is named on screen. */
export function ServiceIssues({ resources }) {
    const theme = useTUITheme();
    const issues = resources.filter((r) => r.status !== "ready" && r.statusReason);
    if (issues.length === 0)
        return null;
    return (_jsx(Box, { flexDirection: "column", marginTop: 1, children: issues.map((resource) => (_jsxs(Text, { color: theme.muted, children: [resource.name, ": ", resource.statusReason] }, resource.name))) }));
}
