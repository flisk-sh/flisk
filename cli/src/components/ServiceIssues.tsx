// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import type { ResourceMetadata } from "../types/index.js";
import { useTUITheme } from "./ui-theme.js";

/** One line per service that is not ready and has a reason, so a failed dependency is named on screen. */
export function ServiceIssues({ resources }: { resources: ResourceMetadata[] }) {
  const theme = useTUITheme();
  const issues = resources.filter((r) => r.status !== "ready" && r.statusReason);
  if (issues.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      {issues.map((resource) => (
        <Text key={resource.name} color={theme.muted}>
          {resource.name}: {resource.statusReason}
        </Text>
      ))}
    </Box>
  );
}
