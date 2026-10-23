// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import type React from "react";
import type { BaseTooltipProps } from "../types/index.js";
import { useTUITheme } from "./ui-theme.js";

export const BaseTooltip: React.FC<BaseTooltipProps> = ({
  content,
  shortcut,
  visible,
  maxWidth = 40,
  wrapText = false,
  prefix = "",
  marginTop = 0,
}) => {
  const theme = useTUITheme();
  if (!visible) return null;

  const lines: string[] = wrapText ? wrapContent(content, maxWidth) : [content];

  return (
    <Box
      flexDirection="column"
      borderStyle={theme.ascii ? undefined : "single"}
      borderColor={theme.warning}
      paddingX={1}
      paddingY={1}
      backgroundColor={theme.ascii ? undefined : "black"}
      marginTop={marginTop}
    >
      {lines.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static color-chip list, stable order
        <Text key={i} color={theme.warning} bold={theme.highContrast}>
          {prefix}
          {line}
        </Text>
      ))}
      {shortcut && (
        <Box marginTop={1}>
          <Text color={theme.muted}>Press </Text>
          <Text color={theme.accent} bold>
            {shortcut.startsWith("[") ? shortcut : `[${shortcut}]`}
          </Text>
          <Text color={theme.muted}> to use</Text>
        </Box>
      )}
    </Box>
  );
};

export function wrapContent(content: string, maxWidth: number): string[] {
  const words = content.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine && (currentLine + word).length > maxWidth - 2) {
      lines.push(currentLine.trim());
      currentLine = `${word} `;
    } else {
      currentLine += `${word} `;
    }
  }
  if (currentLine) {
    lines.push(currentLine.trim());
  }
  return lines;
}
