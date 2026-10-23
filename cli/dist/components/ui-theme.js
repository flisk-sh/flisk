// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createContext, useContext } from "react";
const FILE_TYPES = ["docker", "tilt", "config", "prisma", "generated", "unknown"];
const DEFAULT_FILE_COLORS = {
    docker: "blue",
    tilt: "cyan",
    config: "yellow",
    prisma: "magenta",
    generated: "gray",
    unknown: "white",
};
const HIGH_CONTRAST_FILE_COLORS = {
    docker: "blueBright",
    tilt: "cyanBright",
    config: "yellowBright",
    prisma: "magentaBright",
    generated: "whiteBright",
    unknown: "whiteBright",
};
/** Build the TUI palette from the requested theme and terminal environment. */
export function createTUITheme(highContrast, environment = process.env) {
    const ascii = environment.NO_COLOR !== undefined ||
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
            fileColors: Object.fromEntries(FILE_TYPES.map((type) => [type, undefined])),
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
const STATUS_COLOR_THEMES = {
    green: "success",
    yellow: "warning",
    red: "error",
};
/** Map a formatter status color to the active theme palette. */
export function getTUIStatusColor(theme, color) {
    const themeKey = STATUS_COLOR_THEMES[color ?? ""];
    return themeKey ? theme[themeKey] : theme.muted;
}
/** Return a status marker suited to the active terminal character set. */
export function getTUIStatusIcon(theme, icon, color) {
    if (!theme.ascii)
        return icon;
    if (color === "green")
        return "[+]";
    if (color === "yellow")
        return "[~]";
    if (color === "red")
        return "[x]";
    return "[?]";
}
/** Return a tab section heading suited to the active terminal character set. */
export function sectionTitle(theme, title) {
    return theme.ascii ? `[ ${title} ]` : `┌─ ${title} ─`;
}
export const TUIThemeContext = createContext(createTUITheme(false));
/** Read the theme provided to the current TUI subtree. */
export function useTUITheme() {
    return useContext(TUIThemeContext);
}
