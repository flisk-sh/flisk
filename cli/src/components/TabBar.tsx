// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import type React from "react";
import type { TabBarProps } from "../types/index.js";
import { getTabBarDensity, getTerminalRuleWidth } from "../utils/terminal-layout.js";
import { TABS } from "../utils/ui-keymap.js";
import { useTUITheme } from "./ui-theme.js";

export { TABS };

export const TabBar: React.FC<TabBarProps> = ({ activeTab, compact = false, terminalWidth }) => {
  const theme = useTUITheme();
  const responsive = terminalWidth !== undefined;
  const density = terminalWidth === undefined ? "wide" : getTabBarDensity(terminalWidth);
  const compactLayout = responsive && density === "compact";
  const wide = !responsive || density === "wide";
  const ruleWidth = responsive ? getTerminalRuleWidth(terminalWidth) : compact ? 60 : 80;
  const divider = (theme.ascii ? "-" : "\u2500").repeat(ruleWidth);
  const selectedBorderProps = theme.ascii
    ? {}
    : { borderStyle: "single" as const, borderColor: theme.accent };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color={theme.muted} dimColor={theme.dimMuted}>
          {divider}
        </Text>
      </Box>
      <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const label =
            compactLayout || (!responsive && compact && !isActive)
              ? tab.label.slice(0, 4)
              : tab.label;

          return (
            <Box key={tab.id}>
              {compactLayout ? (
                <Text
                  color={isActive ? theme.selectedForeground : theme.muted}
                  bold={isActive || theme.highContrast}
                  backgroundColor={isActive ? theme.selectedBackground : undefined}
                >
                  {isActive ? `${theme.selectionMarker} ` : ""}[{tab.shortcut}] {label}
                </Text>
              ) : isActive ? (
                <Box
                  {...selectedBorderProps}
                  paddingX={wide ? 1 : 0}
                  backgroundColor={theme.selectedBackground}
                >
                  <Text>
                    {wide && <Text color={theme.selectedForeground}>{theme.bannerStart}</Text>}
                    <Text color={theme.selectedForeground} bold>
                      {" "}
                      [{tab.shortcut}] {label}{" "}
                    </Text>
                    {wide && <Text color={theme.selectedForeground}>{theme.bannerEnd}</Text>}
                  </Text>
                </Box>
              ) : (
                <Box paddingX={wide ? 1 : 0}>
                  <Text color={theme.muted} dimColor={theme.dimMuted} bold={theme.highContrast}>
                    [{tab.shortcut}] {label}
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted} dimColor={theme.dimMuted}>
          {divider}
        </Text>
      </Box>
    </Box>
  );
};
