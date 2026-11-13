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
/**
 * Detect whether the terminal environment reports a light background.
 * Terminals commonly export COLORFGBG as "fg;bg" or "fg;bg;extra" (e.g. "0;15" or "0;7").
 */
export function isLightTerminal(environment = process.env) {
    const colorfgbg = environment.COLORFGBG;
    if (!colorfgbg)
        return false;
    const parts = colorfgbg.split(";");
    if (parts.length >= 2) {
        const bg = Number.parseInt(parts.at(-1) ?? "", 10);
        return bg === 7 || bg === 15 || bg >= 8;
    }
    return false;
}
/**
 * Detect whether the terminal can draw Unicode box-drawing and spinner characters.
 * The first set locale variable (LC_ALL, LC_CTYPE, LANG) must name UTF-8; with none set, assume Unicode.
 */
export function supportsUnicode(environment = process.env) {
    const term = environment.TERM?.toLowerCase();
    if (term === "linux" || term?.startsWith("dumb"))
        return false;
    const locale = environment.LC_ALL || environment.LC_CTYPE || environment.LANG;
    return !locale || /utf-?8/i.test(locale);
}
/** Build the TUI palette from the requested theme and terminal environment. */
export function createTUITheme(highContrast, environment = process.env) {
    const plain = environment.NO_COLOR !== undefined ||
        environment.TERM?.toLowerCase().startsWith("dumb") === true;
    const ascii = plain || !supportsUnicode(environment);
    const light = !highContrast && !plain && isLightTerminal(environment);
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
        : light
            ? {
                accent: "blue",
                border: "gray",
                muted: "gray",
                foreground: "black",
                success: "green",
                warning: "yellow",
                error: "red",
                info: "blue",
                secondary: "magenta",
                selectedBackground: "black",
                selectedForeground: "white",
                selectionBackground: "blue",
                selectionForeground: "white",
                dimMuted: false,
                fileColors: DEFAULT_FILE_COLORS,
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
    const colorless = plain
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
        highContrast: highContrast && !plain,
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
