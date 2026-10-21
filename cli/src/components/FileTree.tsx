// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Box, Text } from "ink";
import type React from "react";
import { useState } from "react";
import type { FileNode, FileTreeProps, FileType } from "../types/index.js";
import { formatBytes } from "../utils/formatting.js";
import { useTUITheme } from "./ui-theme.js";

const FILE_ICONS: Record<FileType, string> = {
  docker: "\uD83D\uDC33",
  tilt: "\u2699\uFE0F",
  config: "\uD83D\uDD27",
  prisma: "\uD83D\uDDC4\uFE0F",
  generated: "\uD83D\uDCC4",
  unknown: "\uD83D\uDCC3",
};

const ASCII_FILE_ICONS: Record<FileType, string> = {
  docker: "[D]",
  tilt: "[T]",
  config: "[C]",
  prisma: "[P]",
  generated: "[G]",
  unknown: "[?]",
};

// biome-ignore lint/correctness/noUnusedFunctionParameters: reserved callback prop kept in the component API
export const FileTree: React.FC<FileTreeProps> = ({ nodes, onSelect, selectedPath }) => {
  const theme = useTUITheme();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const _toggleNode = (path: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedNodes(newExpanded);
  };

  const renderNode = (node: FileNode, depth: number = 0): React.ReactElement => {
    const isExpanded = expandedNodes.has(node.path);
    const isSelected = selectedPath === node.path;
    const indent = "  ".repeat(depth);

    if (node.type === "directory") {
      return (
        <Box key={node.path} flexDirection="column">
          <Box>
            <Text
              color={isSelected ? theme.selectionForeground : theme.foreground}
              bold={isSelected}
              backgroundColor={isSelected ? theme.selectionBackground : undefined}
            >
              {indent}
              {theme.ascii ? (isExpanded ? "[-]" : "[+]") : isExpanded ? "\u25BC" : "\u25B6"}{" "}
              {node.name}
            </Text>
          </Box>
          {isExpanded && node.children?.map((child) => renderNode(child, depth + 1))}
        </Box>
      );
    }

    const fileType = node.fileType ?? "unknown";
    const icon = theme.ascii ? ASCII_FILE_ICONS[fileType] : FILE_ICONS[fileType];
    const color = theme.fileColors[fileType];

    return (
      <Box key={node.path}>
        <Text
          color={isSelected ? theme.selectionForeground : color}
          bold={isSelected}
          backgroundColor={isSelected ? theme.selectionBackground : undefined}
        >
          {indent} {icon} {node.name}
        </Text>
        {node.size && (
          <Text color={theme.muted} dimColor={theme.dimMuted}>
            {" "}
            ({formatBytes(node.size)})
          </Text>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {nodes.map((node) => renderNode(node, 0))}
    </Box>
  );
};
