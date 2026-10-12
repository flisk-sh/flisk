import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import { useTUITheme } from "./ui-theme.js";
const TRUNCATE = "truncate-end";
export const TUIHeader = ({ projectRoot, resourceCount, terminalWidth, version, }) => {
    const theme = useTUITheme();
    const compact = terminalWidth < 80;
    const title = compact
        ? `TDK v${version}`
        : `${theme.bannerStart} TDK NEON EDITION v${version} ${theme.bannerEnd}`;
    const resourceLabel = `${resourceCount} resource${resourceCount === 1 ? "" : "s"} discovered`;
    const paddingX = terminalWidth >= 28 ? 1 : 0;
    const contentWidth = Math.max(1, terminalWidth - paddingX * 2);
    if (compact) {
        const splitHeading = title.length + " | ".length + resourceLabel.length > contentWidth;
        return (_jsxs(Box, { flexDirection: "column", paddingX: paddingX, width: terminalWidth, children: [splitHeading ? (_jsxs(_Fragment, { children: [_jsx(Box, { width: contentWidth, children: _jsx(Text, { color: theme.accent, bold: true, wrap: TRUNCATE, children: title }) }), _jsx(Box, { width: contentWidth, children: _jsx(Text, { color: theme.success, wrap: TRUNCATE, children: resourceLabel }) })] })) : (_jsx(Box, { width: contentWidth, children: _jsxs(Text, { wrap: TRUNCATE, children: [_jsx(Text, { color: theme.accent, bold: true, children: title }), _jsx(Text, { color: theme.muted, children: " | " }), _jsx(Text, { color: theme.success, children: resourceLabel })] }) })), _jsx(Box, { width: contentWidth, children: _jsx(Text, { color: theme.foreground, wrap: TRUNCATE, children: projectRoot }) })] }));
    }
    const separatorsWidth = " | ".length * 2;
    const headingWidth = title.length + resourceLabel.length + separatorsWidth;
    if (headingWidth >= contentWidth) {
        return (_jsxs(Box, { flexDirection: "column", paddingX: paddingX, width: terminalWidth, children: [_jsx(Box, { width: contentWidth, children: _jsx(Text, { color: theme.accent, bold: true, wrap: TRUNCATE, children: title }) }), _jsx(Box, { width: contentWidth, children: _jsx(Text, { color: theme.success, wrap: TRUNCATE, children: resourceLabel }) }), _jsx(Box, { width: contentWidth, children: _jsx(Text, { color: theme.foreground, wrap: TRUNCATE, children: projectRoot }) })] }));
    }
    const rootWidth = contentWidth - headingWidth;
    return (_jsxs(Box, { flexDirection: "row", paddingX: paddingX, width: terminalWidth, children: [_jsx(Text, { color: theme.accent, bold: true, children: title }), _jsx(Text, { color: theme.muted, children: " | " }), _jsx(Box, { flexShrink: 0, width: rootWidth, children: _jsx(Text, { color: theme.foreground, wrap: TRUNCATE, children: projectRoot }) }), _jsx(Text, { color: theme.muted, children: " | " }), _jsx(Text, { color: theme.success, children: resourceLabel })] }));
};
