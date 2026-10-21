// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import type { StatusCategory, StatusValue } from "../types/index.js";

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural || `${singular}s`;
}

export function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", DATE_FORMAT_OPTIONS);
}

export function formatShortDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_CATEGORY_CONFIG: Record<
  StatusCategory,
  { color: string; icon: string; chalkFn: (text: string) => string }
> = {
  success: { color: "green", icon: "✓", chalkFn: chalk.green },
  error: { color: "red", icon: "✗", chalkFn: chalk.red },
  warning: { color: "yellow", icon: "○", chalkFn: chalk.yellow },
  unknown: { color: "gray", icon: "?", chalkFn: chalk.gray },
};

function getStatusCategory(status: StatusValue): StatusCategory {
  if (!status) return "unknown";
  const lowerStatus = status.toLowerCase();

  if (
    lowerStatus === "ready" ||
    lowerStatus === "healthy" ||
    lowerStatus === "active" ||
    lowerStatus === "running"
  ) {
    return "success";
  }

  if (
    lowerStatus === "error" ||
    lowerStatus === "failed" ||
    lowerStatus === "critical" ||
    lowerStatus === "stopped"
  ) {
    return "error";
  }

  if (
    lowerStatus === "pending" ||
    lowerStatus === "starting" ||
    lowerStatus === "building" ||
    lowerStatus === "degraded"
  ) {
    return "warning";
  }

  return "unknown";
}

export function getStatusColor(status: StatusValue): string {
  return STATUS_CATEGORY_CONFIG[getStatusCategory(status)].color;
}

export function getStatusIcon(status: StatusValue): string {
  return STATUS_CATEGORY_CONFIG[getStatusCategory(status)].icon;
}

export function colorizeByStatus(text: string, status: StatusValue): string {
  return STATUS_CATEGORY_CONFIG[getStatusCategory(status)].chalkFn(text);
}

type EmptyStateItemType = "resources" | "stacks" | "services" | "stack-services";

const EMPTY_STATE_CONFIG: Record<
  EmptyStateItemType,
  { singular: string; command: string; context?: string }
> = {
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

export function showEmptyState(itemType: EmptyStateItemType, filterContext?: string): void {
  const config = EMPTY_STATE_CONFIG[itemType];

  if (filterContext) {
    console.log(chalk.yellow(`No ${config.singular}s found${filterContext}.`));
  } else {
    console.log(chalk.yellow(`No ${config.singular}s found.`));
  }

  console.log(chalk.gray(config.context));
  console.log(chalk.gray(`  ${config.command}`));

  if (itemType === "stacks") {
    console.log(chalk.gray("\nOr create a new resource with a stack:"));
    console.log(chalk.gray("  flisk resource <name> --stack <stack-name>"));
  }
}

export function showCancelled(message?: string): void {
  console.log(chalk.yellow(message || "Cancelled."));
}

export function showCommandHeader(title: string): void {
  console.log(chalk.blue(`Flisk ${title}\n`));
}

export function showAllSatisfyCondition(items: string, condition: string): void {
  console.log(chalk.green(`All ${items} are ${condition}!`));
}

/** Default width for ASCII boxes */
export const DEFAULT_BOX_WIDTH = 62;

export function formatBoxLine(char: string = "─", width: number = DEFAULT_BOX_WIDTH): string {
  return char.repeat(width);
}

export function formatCentered(text: string, width: number = DEFAULT_BOX_WIDTH - 2): string {
  const padding = Math.max(0, width - text.length);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return " ".repeat(left) + text + " ".repeat(right);
}

export function formatPadded(text: string, width: number): string {
  if (text.length > width) {
    return `${text.slice(0, width - 1)}…`;
  }
  return text.padEnd(width);
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength - 3)}...`;
}

export function showSuccess(message: string): void {
  console.log(chalk.green(`✓ ${message}`));
}

export function showStep(message: string): void {
  console.log(chalk.blue(message));
}

export function showDetail(message: string, indent = 2): void {
  console.log(chalk.gray(`${" ".repeat(indent)}${message}`));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Print a boxed header with title and optional subtitle.
 * Consolidates common box formatting patterns from networks.ts and other commands.
 * @param title - The main title to display
 * @param subtitle - Optional subtitle (e.g., domain info)
 * @param width - Box width (defaults to DEFAULT_BOX_WIDTH)
 */
export function printBoxedHeader(
  title: string,
  subtitle?: string,
  width: number = DEFAULT_BOX_WIDTH,
): void {
  const innerWidth = width - 2;
  const line = "─".repeat(innerWidth);

  console.log();
  console.log(chalk.cyan(`╭${line}╮`));
  console.log(
    chalk.cyan("│") + chalk.bold.white(formatCentered(title, innerWidth)) + chalk.cyan("│"),
  );

  if (subtitle) {
    console.log(chalk.cyan(`├${line}┤`));
    console.log(
      chalk.cyan("│") + chalk.gray(formatCentered(subtitle, innerWidth)) + chalk.cyan("│"),
    );
  }

  console.log(chalk.cyan(`╰${line}╯`));
}
