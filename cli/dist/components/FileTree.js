import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import { useState } from "react";
import { formatBytes } from "../utils/formatting.js";
import { useTUITheme } from "./ui-theme.js";
const FILE_ICONS = {
    docker: "\uD83D\uDC33",
    tilt: "\u2699\uFE0F",
    config: "\uD83D\uDD27",
    prisma: "\uD83D\uDDC4\uFE0F",
    generated: "\uD83D\uDCC4",
    unknown: "\uD83D\uDCC3",
};
const ASCII_FILE_ICONS = {
    docker: "[D]",
    tilt: "[T]",
    config: "[C]",
    prisma: "[P]",
    generated: "[G]",
    unknown: "[?]",
};
// biome-ignore lint/correctness/noUnusedFunctionParameters: reserved callback prop kept in the component API
export const FileTree = ({ nodes, onSelect, selectedPath }) => {
    const theme = useTUITheme();
    const [expandedNodes, setExpandedNodes] = useState(new Set());
    const _toggleNode = (path) => {
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(path)) {
            newExpanded.delete(path);
        }
        else {
            newExpanded.add(path);
        }
        setExpandedNodes(newExpanded);
    };
    const renderNode = (node, depth = 0) => {
        const isExpanded = expandedNodes.has(node.path);
        const isSelected = selectedPath === node.path;
        const indent = "  ".repeat(depth);
        if (node.type === "directory") {
            return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Box, { children: _jsxs(Text, { color: isSelected ? theme.selectionForeground : theme.foreground, bold: isSelected, backgroundColor: isSelected ? theme.selectionBackground : undefined, children: [indent, theme.ascii ? (isExpanded ? "[-]" : "[+]") : isExpanded ? "\u25BC" : "\u25B6", " ", node.name] }) }), isExpanded && node.children?.map((child) => renderNode(child, depth + 1))] }, node.path));
        }
        const fileType = node.fileType ?? "unknown";
        const icon = theme.ascii ? ASCII_FILE_ICONS[fileType] : FILE_ICONS[fileType];
        const color = theme.fileColors[fileType];
        return (_jsxs(Box, { children: [_jsxs(Text, { color: isSelected ? theme.selectionForeground : color, bold: isSelected, backgroundColor: isSelected ? theme.selectionBackground : undefined, children: [indent, " ", icon, " ", node.name] }), node.size && (_jsxs(Text, { color: theme.muted, dimColor: theme.dimMuted, children: [" ", "(", formatBytes(node.size), ")"] }))] }, node.path));
    };
    return (_jsx(Box, { flexDirection: "column", paddingX: 1, children: nodes.map((node) => renderNode(node, 0)) }));
};
