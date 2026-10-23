import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import { formatShortDate, getStatusColor, getStatusIcon, truncate } from "../utils/formatting.js";
import { getTUIStatusColor, getTUIStatusIcon, useTUITheme } from "./ui-theme.js";
export const ResourceTable = ({ resources, maxWidth = 100 }) => {
    const theme = useTUITheme();
    if (resources.length === 0) {
        return (_jsx(Box, { paddingY: 1, children: _jsx(Text, { color: theme.muted, children: "No resources found" }) }));
    }
    const narrowMode = maxWidth < 80;
    const tableContentWidth = Math.max(1, Math.floor(maxWidth) - 4);
    const extraWidth = tableContentWidth - (narrowMode ? 19 : 26);
    const nameWidth = 4 + Math.floor(extraWidth * (narrowMode ? 0.37 : 0.29));
    const stackWidth = 5 + Math.floor(extraWidth * (narrowMode ? 0.22 : 0.2));
    const typeWidth = 4 + Math.floor(extraWidth * (narrowMode ? 0.2 : 0.13));
    const statusWidth = narrowMode
        ? tableContentWidth - nameWidth - stackWidth - typeWidth
        : 6 + Math.floor(extraWidth * 0.17);
    const createdWidth = narrowMode
        ? 0
        : tableContentWidth - nameWidth - stackWidth - typeWidth - statusWidth;
    const borderProps = theme.ascii
        ? {}
        : { borderStyle: "single", borderColor: theme.border };
    return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Box, { flexDirection: "row", ...borderProps, paddingX: 1, children: [_jsx(Box, { width: nameWidth, children: _jsx(Text, { bold: true, color: theme.foreground, children: "Name" }) }), _jsx(Box, { width: stackWidth, children: _jsx(Text, { bold: true, color: theme.foreground, children: "Stack" }) }), _jsx(Box, { width: typeWidth, children: _jsx(Text, { bold: true, color: theme.foreground, children: "Type" }) }), _jsx(Box, { width: statusWidth, children: _jsx(Text, { bold: true, color: theme.foreground, children: "Status" }) }), !narrowMode && (_jsx(Box, { width: createdWidth, children: _jsx(Text, { bold: true, color: theme.foreground, children: "Created" }) }))] }), resources.map((resource) => {
                const sourceStatusColor = getStatusColor(resource.status);
                const statusColor = getTUIStatusColor(theme, sourceStatusColor);
                const statusIcon = getTUIStatusIcon(theme, getStatusIcon(resource.status), sourceStatusColor);
                const statusLabel = `${statusIcon} ${resource.status}`;
                const stackName = resource.stack && resource.stack !== "unknown" ? resource.stack : "-";
                return (_jsxs(Box, { flexDirection: "row", paddingX: 1, children: [_jsx(Box, { width: nameWidth, children: _jsx(Text, { color: theme.foreground, children: truncate(resource.name, Math.max(3, nameWidth - 1)) }) }), _jsx(Box, { width: stackWidth, children: _jsx(Text, { color: theme.muted, children: truncate(stackName, Math.max(3, stackWidth - 1)) }) }), _jsx(Box, { width: typeWidth, children: _jsx(Text, { color: theme.accent, bold: theme.highContrast, children: truncate(resource.type, Math.max(3, typeWidth - 1)) }) }), _jsx(Box, { width: statusWidth, children: _jsx(Text, { color: statusColor, bold: theme.highContrast, children: truncate(statusLabel, Math.max(3, statusWidth - 1)) }) }), !narrowMode && (_jsx(Box, { width: createdWidth, children: _jsx(Text, { color: theme.muted, children: truncate(formatShortDate(resource.createdAt), Math.max(3, createdWidth - 1)) }) }))] }, resource.name));
            })] }));
};
