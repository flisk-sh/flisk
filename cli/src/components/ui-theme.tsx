// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createContext, useContext } from "react";
import type { FileType } from "../types/index.js";

type TUIColor = string | undefined;

export interface TUITheme {
  accent: TUIColor;
  border: TUIColor;
  muted: TUIColor;
  foreground: TUIColor;
  success: TUIColor;
  warning: TUIColor;
  error: TUIColor;
  info: TUIColor;
  secondary: TUIColor;
  selectedBackground: TUIColor;
  selectedForeground: TUIColor;
  selectionBackground: TUIColor;
  selectionForeground: TUIColor;
  dimMuted: boolean;
  highContrast: boolean;
  ascii: boolean;
  bannerStart: string;
  bannerEnd: string;
  selectionMarker: string;
  separator: string;
  fileColors: Record<FileType, TUIColor>;
}

type TUIEnvironment = {
  NO_COLOR?: string;
  TERM?: string;
};

const FILE_TYPES: FileType[] = ["docker", "tilt", "config", "prisma", "generated", "unknown"];

const DEFAULT_FILE_COLORS: Record<FileType, string> = {
  docker: "blue",
  tilt: "cyan",
  config: "yellow",
  prisma: "magenta",
  generated: "gray",
  unknown: "white",
};

const HIGH_CONTRAST_FILE_COLORS: Record<FileType, string> = {
  docker: "blueBright",
  tilt: "cyanBright",
  config: "yellowBright",
  prisma: "magentaBright",
  generated: "whiteBright",
  unknown: "whiteBright",
};

/** Build the TUI palette from the requested theme and terminal environment. */
export function createTUITheme(
  highContrast: boolean,
  environment: TUIEnvironment = process.env,
): TUITheme {
  const ascii =
    environment.NO_COLOR !== undefined ||
    environment.TERM?.toLowerCase().startsWith("dumb") === true;
  const palette = highContrast
    ? {
        accent: "cyanBright",
        border: "whiteBright",
        muted: "white",
        foreground: "whiteBright",
        success: "greenBright",
        warning: "yellowBright",
        error: "redBright",
        info: "blueBright",
        secondary: "magentaBright",
        selectedBackground: "cyanBright",
        selectedForeground: "black",
        selectionBackground: "blueBright",
        selectionForeground: "whiteBright",
        dimMuted: false,
        fileColors: HIGH_CONTRAST_FILE_COLORS,
      }
    : {
        accent: "cyan",
        border: "gray",
        muted: "gray",
        foreground: "white",
        success: "green",
        warning: "yellow",
        error: "red",
        info: "blue",
        secondary: "magenta",
        selectedBackground: "black",
        selectedForeground: "cyan",
        selectionBackground: "blue",
        selectionForeground: "cyan",
        dimMuted: true,
        fileColors: DEFAULT_FILE_COLORS,
      };

  const colorless = ascii
    ? {
        accent: undefined,
        border: undefined,
        muted: undefined,
        foreground: undefined,
        success: undefined,
        warning: undefined,
        error: undefined,
        info: undefined,
        secondary: undefined,
        selectedBackground: undefined,
        selectedForeground: undefined,
        selectionBackground: undefined,
        selectionForeground: undefined,
        dimMuted: false,
        fileColors: Object.fromEntries(FILE_TYPES.map((type) => [type, undefined])) as Record<
          FileType,
          undefined
        >,
      }
    : {};

  return {
    ...palette,
    ...colorless,
    highContrast: highContrast && !ascii,
    ascii,
    bannerStart: ascii ? ">>>" : "\u2593\u2592\u2591",
    bannerEnd: ascii ? "<<<" : "\u2591\u2592\u2593",
    selectionMarker: ascii ? ">>>" : "\u2593\u2592\u2591",
    separator: ascii ? " | " : " \u2502 ",
  };
}

const STATUS_COLOR_THEMES: Record<string, "success" | "warning" | "error"> = {
  green: "success",
  yellow: "warning",
  red: "error",
};

/** Map a formatter status color to the active theme palette. */
export function getTUIStatusColor(theme: TUITheme, color: string | undefined): TUIColor {
  const themeKey = STATUS_COLOR_THEMES[color ?? ""];
  return themeKey ? theme[themeKey] : theme.muted;
}

/** Return a status marker suited to the active terminal character set. */
export function getTUIStatusIcon(theme: TUITheme, icon: string, color: string | undefined): string {
  if (!theme.ascii) return icon;
  if (color === "green") return "[+]";
  if (color === "yellow") return "[~]";
  if (color === "red") return "[x]";
  return "[?]";
}

/** Return a tab section heading suited to the active terminal character set. */
export function sectionTitle(theme: TUITheme, title: string): string {
  return theme.ascii ? `[ ${title} ]` : `┌─ ${title} ─`;
}

export const TUIThemeContext = createContext(createTUITheme(false));

/** Read the theme provided to the current TUI subtree. */
export function useTUITheme(): TUITheme {
  return useContext(TUIThemeContext);
}
