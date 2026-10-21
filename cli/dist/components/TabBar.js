import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import { getTabBarDensity, getTerminalRuleWidth } from "../utils/terminal-layout.js";
import { TABS } from "../utils/ui-keymap.js";
import { useTUITheme } from "./ui-theme.js";
export { TABS };
export const TabBar = ({ activeTab, compact = false, terminalWidth }) => {
    const theme = useTUITheme();
    const responsive = terminalWidth !== undefined;
    const density = terminalWidth === undefined ? "wide" : getTabBarDensity(terminalWidth);
    const compactLayout = responsive && density === "compact";
    const wide = !responsive || density === "wide";
    const ruleWidth = responsive ? getTerminalRuleWidth(terminalWidth) : compact ? 60 : 80;
    const divider = (theme.ascii ? "-" : "\u2500").repeat(ruleWidth);
    const selectedBorderProps = theme.ascii
        ? {}
        : { borderStyle: "single", borderColor: theme.accent };
    return (_jsxs(Box, { flexDirection: "column", paddingX: 1, children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { color: theme.muted, dimColor: theme.dimMuted, children: divider }) }), _jsx(Box, { flexDirection: "row", justifyContent: "space-between", paddingX: 1, children: TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const label = compactLayout || (!responsive && compact && !isActive)
                        ? tab.label.slice(0, 4)
                        : tab.label;
                    return (_jsx(Box, { children: compactLayout ? (_jsxs(Text, { color: isActive ? theme.selectedForeground : theme.muted, bold: isActive || theme.highContrast, backgroundColor: isActive ? theme.selectedBackground : undefined, children: [isActive ? `${theme.selectionMarker} ` : "", "[", tab.shortcut, "] ", label] })) : isActive ? (_jsx(Box, { ...selectedBorderProps, paddingX: wide ? 1 : 0, backgroundColor: theme.selectedBackground, children: _jsxs(Text, { children: [wide && _jsx(Text, { color: theme.selectedForeground, children: theme.bannerStart }), _jsxs(Text, { color: theme.selectedForeground, bold: true, children: [" ", "[", tab.shortcut, "] ", label, " "] }), wide && _jsx(Text, { color: theme.selectedForeground, children: theme.bannerEnd })] }) })) : (_jsx(Box, { paddingX: wide ? 1 : 0, children: _jsxs(Text, { color: theme.muted, dimColor: theme.dimMuted, bold: theme.highContrast, children: ["[", tab.shortcut, "] ", label] }) })) }, tab.id));
                }) }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: theme.muted, dimColor: theme.dimMuted, children: divider }) })] }));
};
