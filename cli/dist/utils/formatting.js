// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
function pluralize(count, singular, plural) {
    return count === 1 ? singular : plural || `${singular}s`;
}
export function formatCount(count, singular, plural) {
    return `${count} ${pluralize(count, singular, plural)}`;
}
const DATE_FORMAT_OPTIONS = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
};
export function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", DATE_FORMAT_OPTIONS);
}
export function formatShortDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
const STATUS_CATEGORY_CONFIG = {
    success: { color: "green", icon: "✓", chalkFn: chalk.green },
    error: { color: "red", icon: "✗", chalkFn: chalk.red },
    warning: { color: "yellow", icon: "○", chalkFn: chalk.yellow },
    unknown: { color: "gray", icon: "?", chalkFn: chalk.gray },
};
function getStatusCategory(status) {
    if (!status)
        return "unknown";
    const lowerStatus = status.toLowerCase();
    if (lowerStatus === "ready" ||
        lowerStatus === "healthy" ||
        lowerStatus === "active" ||
        lowerStatus === "running") {
        return "success";
    }
    if (lowerStatus === "error" ||
        lowerStatus === "failed" ||
        lowerStatus === "critical" ||
        lowerStatus === "stopped") {
        return "error";
    }
    if (lowerStatus === "pending" ||
        lowerStatus === "starting" ||
        lowerStatus === "building" ||
        lowerStatus === "degraded") {
        return "warning";
    }
    return "unknown";
}
export function getStatusColor(status) {
    return STATUS_CATEGORY_CONFIG[getStatusCategory(status)].color;
}
export function getStatusIcon(status) {
    return STATUS_CATEGORY_CONFIG[getStatusCategory(status)].icon;
}
export function colorizeByStatus(text, status) {
    return STATUS_CATEGORY_CONFIG[getStatusCategory(status)].chalkFn(text);
}
const EMPTY_STATE_CONFIG = {
    resources: {
        singular: "resource",
        command: "flisk resource <name>",
        context: "\nTo create a resource:",
    },
    stacks: {
        singular: "stack",
        command: "flisk stack <stack-name>",
        context: "\nTo create a stack, use:",
    },
    services: {
        singular: "service",
        command: "flisk resource <name>",
        context: "\nTo create a service:",
    },
    "stack-services": {
        singular: "service",
        command: "flisk resource <name> --stack <stack-name>",
        context: "\nTo add services to this stack:",
    },
};
export function showEmptyState(itemType, filterContext) {
    const config = EMPTY_STATE_CONFIG[itemType];
    if (filterContext) {
        console.log(chalk.yellow(`No ${config.singular}s found${filterContext}.`));
    }
    else {
        console.log(chalk.yellow(`No ${config.singular}s found.`));
    }
    console.log(chalk.gray(config.context));
    console.log(chalk.gray(`  ${config.command}`));
    if (itemType === "stacks") {
        console.log(chalk.gray("\nOr create a new resource with a stack:"));
        console.log(chalk.gray("  flisk resource <name> --stack <stack-name>"));
    }
}
export function showCancelled(message) {
    console.log(chalk.yellow(message || "Cancelled."));
}
export function showCommandHeader(title) {
    console.log(chalk.blue(`Flisk ${title}\n`));
}
export function showAllSatisfyCondition(items, condition) {
    console.log(chalk.green(`All ${items} are ${condition}!`));
}
/** Default width for ASCII boxes */
export const DEFAULT_BOX_WIDTH = 62;
export function formatBoxLine(char = "─", width = DEFAULT_BOX_WIDTH) {
    return char.repeat(width);
}
export function formatCentered(text, width = DEFAULT_BOX_WIDTH - 2) {
    const padding = Math.max(0, width - text.length);
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return " ".repeat(left) + text + " ".repeat(right);
}
export function formatPadded(text, width) {
    if (text.length > width) {
        return `${text.slice(0, width - 1)}…`;
    }
    return text.padEnd(width);
}
export function truncate(str, maxLength) {
    if (str.length <= maxLength)
        return str;
    return `${str.slice(0, maxLength - 3)}...`;
}
export function showSuccess(message) {
    console.log(chalk.green(`✓ ${message}`));
}
export function showStep(message) {
    console.log(chalk.blue(message));
}
export function showDetail(message, indent = 2) {
    console.log(chalk.gray(`${" ".repeat(indent)}${message}`));
}
export function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
/**
 * Print a boxed header with title and optional subtitle.
 * Consolidates common box formatting patterns from networks.ts and other commands.
 * @param title - The main title to display
 * @param subtitle - Optional subtitle (e.g., domain info)
 * @param width - Box width (defaults to DEFAULT_BOX_WIDTH)
 */
export function printBoxedHeader(title, subtitle, width = DEFAULT_BOX_WIDTH) {
    const innerWidth = width - 2;
    const line = "─".repeat(innerWidth);
    console.log();
    console.log(chalk.cyan(`╭${line}╮`));
    console.log(chalk.cyan("│") + chalk.bold.white(formatCentered(title, innerWidth)) + chalk.cyan("│"));
    if (subtitle) {
        console.log(chalk.cyan(`├${line}┤`));
        console.log(chalk.cyan("│") + chalk.gray(formatCentered(subtitle, innerWidth)) + chalk.cyan("│"));
    }
    console.log(chalk.cyan(`╰${line}╯`));
}
