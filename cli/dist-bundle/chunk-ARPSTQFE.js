import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/utils/formatting.js
function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural || `${singular}s`;
}
function formatCount(count, singular, plural) {
  return `${count} ${pluralize(count, singular, plural)}`;
}
var DATE_FORMAT_OPTIONS = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
};
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", DATE_FORMAT_OPTIONS);
}
function formatShortDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
var STATUS_CATEGORY_CONFIG = {
  success: { color: "green", icon: "\u2713", chalkFn: source_default.green },
  error: { color: "red", icon: "\u2717", chalkFn: source_default.red },
  warning: { color: "yellow", icon: "\u25CB", chalkFn: source_default.yellow },
  unknown: { color: "gray", icon: "?", chalkFn: source_default.gray }
};
function getStatusCategory(status) {
  if (!status)
    return "unknown";
  const lowerStatus = status.toLowerCase();
  if (lowerStatus === "ready" || lowerStatus === "healthy" || lowerStatus === "active" || lowerStatus === "running") {
    return "success";
  }
  if (lowerStatus === "error" || lowerStatus === "failed" || lowerStatus === "critical" || lowerStatus === "stopped") {
    return "error";
  }
  if (lowerStatus === "pending" || lowerStatus === "starting" || lowerStatus === "building" || lowerStatus === "degraded") {
    return "warning";
  }
  return "unknown";
}
function getStatusColor(status) {
  return STATUS_CATEGORY_CONFIG[getStatusCategory(status)].color;
}
function getStatusIcon(status) {
  return STATUS_CATEGORY_CONFIG[getStatusCategory(status)].icon;
}
function colorizeByStatus(text, status) {
  return STATUS_CATEGORY_CONFIG[getStatusCategory(status)].chalkFn(text);
}
var EMPTY_STATE_CONFIG = {
  resources: {
    singular: "resource",
    command: "flisk resource <name>",
    context: "\nTo create a resource:"
  },
  stacks: {
    singular: "stack",
    command: "flisk stack <stack-name>",
    context: "\nTo create a stack, use:"
  },
  services: {
    singular: "service",
    command: "flisk resource <name>",
    context: "\nTo create a service:"
  },
  "stack-services": {
    singular: "service",
    command: "flisk resource <name> --stack <stack-name>",
    context: "\nTo add services to this stack:"
  }
};
function showEmptyState(itemType, filterContext) {
  const config = EMPTY_STATE_CONFIG[itemType];
  if (filterContext) {
    console.log(source_default.yellow(`No ${config.singular}s found${filterContext}.`));
  } else {
    console.log(source_default.yellow(`No ${config.singular}s found.`));
  }
  console.log(source_default.gray(config.context));
  console.log(source_default.gray(`  ${config.command}`));
  if (itemType === "stacks") {
    console.log(source_default.gray("\nOr create a new resource with a stack:"));
    console.log(source_default.gray("  flisk resource <name> --stack <stack-name>"));
  }
}
function showCancelled(message) {
  console.log(source_default.yellow(message || "Cancelled."));
}
function showCommandHeader(title) {
  console.log(source_default.blue(`Flisk ${title}
`));
}
function showAllSatisfyCondition(items, condition) {
  console.log(source_default.green(`All ${items} are ${condition}!`));
}
var DEFAULT_BOX_WIDTH = 62;
function formatBoxLine(char = "\u2500", width = DEFAULT_BOX_WIDTH) {
  return char.repeat(width);
}
function formatCentered(text, width = DEFAULT_BOX_WIDTH - 2) {
  const padding = Math.max(0, width - text.length);
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return " ".repeat(left) + text + " ".repeat(right);
}
function formatPadded(text, width) {
  if (text.length > width) {
    return `${text.slice(0, width - 1)}\u2026`;
  }
  return text.padEnd(width);
}
function truncate(str, maxLength) {
  if (str.length <= maxLength)
    return str;
  return `${str.slice(0, maxLength - 3)}...`;
}
function showSuccess(message) {
  console.log(source_default.green(`\u2713 ${message}`));
}
function showStep(message) {
  console.log(source_default.blue(message));
}
function showDetail(message, indent = 2) {
  console.log(source_default.gray(`${" ".repeat(indent)}${message}`));
}
function formatBytes(bytes) {
  if (bytes < 1024)
    return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function printBoxedHeader(title, subtitle, width = DEFAULT_BOX_WIDTH) {
  const innerWidth = width - 2;
  const line = "\u2500".repeat(innerWidth);
  console.log();
  console.log(source_default.cyan(`\u256D${line}\u256E`));
  console.log(source_default.cyan("\u2502") + source_default.bold.white(formatCentered(title, innerWidth)) + source_default.cyan("\u2502"));
  if (subtitle) {
    console.log(source_default.cyan(`\u251C${line}\u2524`));
    console.log(source_default.cyan("\u2502") + source_default.gray(formatCentered(subtitle, innerWidth)) + source_default.cyan("\u2502"));
  }
  console.log(source_default.cyan(`\u2570${line}\u256F`));
}

export {
  formatCount,
  formatDate,
  formatShortDate,
  getStatusColor,
  getStatusIcon,
  colorizeByStatus,
  showEmptyState,
  showCancelled,
  showCommandHeader,
  showAllSatisfyCondition,
  DEFAULT_BOX_WIDTH,
  formatBoxLine,
  formatPadded,
  truncate,
  showSuccess,
  showStep,
  showDetail,
  formatBytes,
  printBoxedHeader
};
