// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import type React from "react";
import type { HelpPanelProps } from "../types/index.js";
import { formatUiKeyNames, TABS, UI_KEYMAP } from "../utils/ui-keymap.js";
import { useTUITheme } from "./ui-theme.js";

export const HelpPanel: React.FC<HelpPanelProps> = ({ onClose: _onClose, activeTab }) => {
  const theme = useTUITheme();
  const activeTabEntry = activeTab ? TABS.find((t) => t.id === activeTab) : undefined;
  const screenTitle = activeTabEntry ? `${activeTabEntry.label} screen` : "all screens";

  const borderProps = theme.ascii
    ? {}
    : { borderStyle: "round" as const, borderColor: theme.accent };

  return (
    <Box {...borderProps} paddingX={2} paddingY={1} flexDirection="column" width={64}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={theme.accent}>
          {theme.bannerStart} Keyboard Shortcuts {theme.bannerEnd}
        </Text>
        <Text color={theme.muted}>[{screenTitle}]</Text>
      </Box>
      <Box marginY={1} flexDirection="column">
        {(["Navigation", "Actions"] as const).map((group) => (
          <Box key={group} marginTop={group === "Actions" ? 1 : 0} flexDirection="column">
            <Text bold underline color={theme.foreground}>
              {group}
            </Text>
            {UI_KEYMAP.filter((shortcut) => shortcut.group === group).map((shortcut) => (
              <Text key={shortcut.id} color={theme.foreground}>
                {` ${formatUiKeyNames(shortcut.id, theme.ascii)} ${shortcut.label}`}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
      <Box marginTop={1} justifyContent="center">
        <Text color={theme.muted} dimColor={theme.dimMuted}>
          Press <Text color={theme.accent}>[?]</Text> or <Text color={theme.accent}>[Esc]</Text> or
          any key to close
        </Text>
      </Box>
    </Box>
  );
};
