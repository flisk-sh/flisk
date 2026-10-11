import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import { useTUITheme } from "./ui-theme.js";
export const BaseTooltip = ({ content, shortcut, visible, maxWidth = 40, wrapText = false, prefix = "", marginTop = 0, }) => {
    const theme = useTUITheme();
    if (!visible)
        return null;
    const lines = wrapText ? wrapContent(content, maxWidth) : [content];
    return (_jsxs(Box, { flexDirection: "column", borderStyle: theme.ascii ? undefined : "single", borderColor: theme.warning, paddingX: 1, paddingY: 1, backgroundColor: theme.ascii ? undefined : "black", marginTop: marginTop, children: [lines.map((line, i) => (_jsxs(Text, { color: theme.warning, bold: theme.highContrast, children: [prefix, line] }, i))), shortcut && (_jsxs(Box, { marginTop: 1, children: [_jsx(Text, { color: theme.muted, children: "Press " }), _jsx(Text, { color: theme.accent, bold: true, children: shortcut.startsWith("[") ? shortcut : `[${shortcut}]` }), _jsx(Text, { color: theme.muted, children: " to use" })] }))] }));
};
function wrapContent(content, maxWidth) {
    const words = content.split(" ");
    const lines = [];
    let currentLine = "";
    for (const word of words) {
        if ((currentLine + word).length > maxWidth - 2) {
            lines.push(currentLine.trim());
            currentLine = `${word} `;
        }
        else {
            currentLine += `${word} `;
        }
    }
    if (currentLine) {
        lines.push(currentLine.trim());
    }
    return lines;
}
