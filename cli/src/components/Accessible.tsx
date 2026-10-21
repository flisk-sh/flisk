// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type React from "react";
import type { BaseTooltipProps } from "../types/index.js";
import { BaseTooltip } from "./BaseTooltip.js";
import { useTUITheme } from "./ui-theme.js";

/**
 * Info tooltip variant with predefined accessibility styling.
 * Uses an ℹ prefix ([i] in ASCII mode) and adds margin for better visibility.
 */
export const AccessibleTooltip: React.FC<
  Pick<BaseTooltipProps, "content" | "shortcut" | "visible">
> = ({ content, shortcut, visible }) => {
  const theme = useTUITheme();
  return (
    <BaseTooltip
      content={content}
      shortcut={shortcut}
      visible={visible}
      prefix={theme.ascii ? "[i] " : "ℹ "}
      marginTop={1}
    />
  );
};
