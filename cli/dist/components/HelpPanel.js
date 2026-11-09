import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import { formatUiKeyNames, TABS, UI_KEYMAP } from "../utils/ui-keymap.js";
import { useTUITheme } from "./ui-theme.js";
export const HelpPanel = ({ onClose: _onClose, activeTab }) => {
    const theme = useTUITheme();
    const activeTabEntry = activeTab ? TABS.find((t) => t.id === activeTab) : undefined;
    const screenTitle = activeTabEntry ? `${activeTabEntry.label} screen` : "all screens";
    const borderProps = theme.ascii
        ? {}
        : { borderStyle: "round", borderColor: theme.accent };
    return (_jsxs(Box, { ...borderProps, paddingX: 2, paddingY: 1, flexDirection: "column", width: 64, children: [_jsxs(Box, { justifyContent: "space-between", marginBottom: 1, children: [_jsxs(Text, { bold: true, color: theme.accent, children: [theme.bannerStart, " Keyboard Shortcuts ", theme.bannerEnd] }), _jsxs(Text, { color: theme.muted, children: ["[", screenTitle, "]"] })] }), _jsx(Box, { marginY: 1, flexDirection: "column", children: ["Navigation", "Actions"].map((group) => (_jsxs(Box, { marginTop: group === "Actions" ? 1 : 0, flexDirection: "column", children: [_jsx(Text, { bold: true, underline: true, color: theme.foreground, children: group }), UI_KEYMAP.filter((shortcut) => shortcut.group === group).map((shortcut) => (_jsx(Text, { color: theme.foreground, children: ` ${formatUiKeyNames(shortcut.id, theme.ascii)} ${shortcut.label}` }, shortcut.id)))] }, group))) }), _jsx(Box, { marginTop: 1, justifyContent: "center", children: _jsxs(Text, { color: theme.muted, dimColor: theme.dimMuted, children: ["Press ", _jsx(Text, { color: theme.accent, children: "[?]" }), " or ", _jsx(Text, { color: theme.accent, children: "[Esc]" }), " or any key to close"] }) })] }));
};
