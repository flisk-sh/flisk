// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import type React from "react";
import { useTUITheme } from "./ui-theme.js";

const TRUNCATE = "truncate-end" as const;

interface TUIHeaderProps {
  projectRoot: string;
  resourceCount: number;
  terminalWidth: number;
  version: string;
}

export const TUIHeader: React.FC<TUIHeaderProps> = ({
  projectRoot,
  resourceCount,
  terminalWidth,
  version,
}) => {
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

    return (
      <Box flexDirection="column" paddingX={paddingX} width={terminalWidth}>
        {splitHeading ? (
          <>
            <Box width={contentWidth}>
              <Text color={theme.accent} bold wrap={TRUNCATE}>
                {title}
              </Text>
            </Box>
            <Box width={contentWidth}>
              <Text color={theme.success} wrap={TRUNCATE}>
                {resourceLabel}
              </Text>
            </Box>
          </>
        ) : (
          <Box width={contentWidth}>
            <Text wrap={TRUNCATE}>
              <Text color={theme.accent} bold>
                {title}
              </Text>
              <Text color={theme.muted}> | </Text>
              <Text color={theme.success}>{resourceLabel}</Text>
            </Text>
          </Box>
        )}
        <Box width={contentWidth}>
          <Text color={theme.foreground} wrap={TRUNCATE}>
            {projectRoot}
          </Text>
        </Box>
      </Box>
    );
  }

  const separatorsWidth = " | ".length * 2;
  const headingWidth = title.length + resourceLabel.length + separatorsWidth;

  if (headingWidth >= contentWidth) {
    return (
      <Box flexDirection="column" paddingX={paddingX} width={terminalWidth}>
        <Box width={contentWidth}>
          <Text color={theme.accent} bold wrap={TRUNCATE}>
            {title}
          </Text>
        </Box>
        <Box width={contentWidth}>
          <Text color={theme.success} wrap={TRUNCATE}>
            {resourceLabel}
          </Text>
        </Box>
        <Box width={contentWidth}>
          <Text color={theme.foreground} wrap={TRUNCATE}>
            {projectRoot}
          </Text>
        </Box>
      </Box>
    );
  }

  const rootWidth = contentWidth - headingWidth;

  return (
    <Box flexDirection="row" paddingX={paddingX} width={terminalWidth}>
      <Text color={theme.accent} bold>
        {title}
      </Text>
      <Text color={theme.muted}> | </Text>
      <Box flexShrink={0} width={rootWidth}>
        <Text color={theme.foreground} wrap={TRUNCATE}>
          {projectRoot}
        </Text>
      </Box>
      <Text color={theme.muted}> | </Text>
      <Text color={theme.success}>{resourceLabel}</Text>
    </Box>
  );
};
