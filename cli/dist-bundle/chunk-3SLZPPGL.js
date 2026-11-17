import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  PROJECT_JSON
} from "./chunk-73W4Y4TI.js";

// dist/utils/flisk-version.js
import { readFileSync } from "node:fs";
import { join } from "node:path";
function evaluateFliskVersion(projectRoot, currentVersion) {
  const floor = evaluateFliskVersionFloor(projectRoot, currentVersion);
  const pin = evaluateFliskVersionPin(projectRoot, currentVersion);
  const warning = floor.deprecationWarning ? { deprecationWarning: floor.deprecationWarning } : {};
  if (floor.status === "malformed") {
    return {
      status: "malformed",
      message: floor.message,
      fix: floor.fix,
      ...warning
    };
  }
  if (pin.status === "malformed") {
    return {
      status: "malformed",
      message: pin.message,
      fix: pin.fix,
      ...warning
    };
  }
  if (pin.status === "mismatch") {
    return {
      status: "mismatch",
      required: pin.required,
      message: pin.message,
      fix: pin.fix,
      ...warning
    };
  }
  if (floor.status === "too-old") {
    return {
      status: "too-old",
      required: floor.required,
      message: floor.message,
      fix: floor.fix,
      ...warning
    };
  }
  if (pin.status === "ok") {
    return {
      status: "ok",
      source: "pin",
      required: pin.required,
      ...warning
    };
  }
  if (floor.status === "ok") {
    return {
      status: "ok",
      source: "floor",
      required: floor.required,
      ...warning
    };
  }
  return {
    status: "none",
    ...warning
  };
}
function toParts(raw) {
  const match = raw.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match)
    return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
  return parts.every(Number.isSafeInteger) ? parts : null;
}
function compareVersions(left, right) {
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0)
      return difference > 0 ? 1 : -1;
  }
  return 0;
}
function readProjectConfig(projectRoot) {
  try {
    const parsed = JSON.parse(readFileSync(join(projectRoot, ".flisk", PROJECT_JSON), "utf-8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return void 0;
    }
    return parsed;
  } catch {
    return void 0;
  }
}
function resolveMinimumVersion(project) {
  const canonical = project.minFliskVersion;
  const legacy = project.minTdkVersion;
  if (canonical !== void 0) {
    return {
      value: canonical,
      field: "minFliskVersion",
      ...legacy !== void 0 ? {
        deprecationWarning: "minTdkVersion is deprecated and ignored because minFliskVersion is set. Remove minTdkVersion from .flisk/project.json."
      } : {}
    };
  }
  if (legacy !== void 0) {
    return {
      value: legacy,
      field: "minTdkVersion",
      deprecationWarning: "minTdkVersion is deprecated. Use minFliskVersion in .flisk/project.json instead."
    };
  }
  return { value: void 0 };
}
function parseExactVersion(raw) {
  if (typeof raw !== "string" || !/^\d+\.\d+\.\d+$/.test(raw)) {
    return null;
  }
  const parts = raw.split(".").map(Number);
  if (!parts.every(Number.isSafeInteger)) {
    return null;
  }
  return { value: raw, parts };
}
function evaluateFliskVersionFloor(projectRoot, currentVersion) {
  const project = readProjectConfig(projectRoot);
  if (!project)
    return { status: "none" };
  const minimumConfig = resolveMinimumVersion(project);
  const minimum = minimumConfig.value;
  const field = minimumConfig.field ?? "minFliskVersion";
  const warning = minimumConfig.deprecationWarning ? { deprecationWarning: minimumConfig.deprecationWarning } : {};
  if (minimum === void 0) {
    return { status: "none", ...warning };
  }
  const required = typeof minimum === "string" ? toParts(minimum) : null;
  if (!required) {
    return {
      status: "malformed",
      message: `.flisk/project.json ${field} ${JSON.stringify(minimum)} is not a version like "1.3.80"`,
      fix: 'Set minFliskVersion to a MAJOR.MINOR.PATCH string, for example "1.3.80".',
      ...warning
    };
  }
  const currentMatch = currentVersion.match(/(\d+)\.(\d+)\.(\d+)/);
  const current = currentMatch ? currentMatch.slice(1).map(Number) : null;
  const requiredText = required.join(".");
  const meets = current !== null && compareVersions(current, required) >= 0;
  if (!meets) {
    return {
      status: "too-old",
      required: requiredText,
      message: `flisk ${currentVersion} is older than the ${requiredText} this project requires (${field})`,
      fix: "Run: flisk upgrade",
      ...warning
    };
  }
  return {
    status: "ok",
    required: requiredText,
    ...warning
  };
}
function evaluateFliskVersionPin(projectRoot, currentVersion) {
  const project = readProjectConfig(projectRoot);
  if (!project || project.pinnedFliskVersion === void 0) {
    return { status: "none" };
  }
  const pin = parseExactVersion(project.pinnedFliskVersion);
  if (!pin) {
    return {
      status: "malformed",
      message: `.flisk/project.json pinnedFliskVersion ${JSON.stringify(project.pinnedFliskVersion)} is not a version like "1.3.80"`,
      fix: 'Set pinnedFliskVersion to a MAJOR.MINOR.PATCH string, for example "1.3.80".'
    };
  }
  const minimumConfig = resolveMinimumVersion(project);
  if (minimumConfig.value !== void 0) {
    const minimumText = typeof minimumConfig.value === "string" ? minimumConfig.value.trim() : "";
    const minimumParts = /^\d+\.\d+\.\d+$/.test(minimumText) ? toParts(minimumText) : null;
    if (minimumParts && compareVersions(pin.parts, minimumParts) < 0) {
      const field = minimumConfig.field ?? "minFliskVersion";
      return {
        status: "malformed",
        message: `pinnedFliskVersion ${pin.value} is lower than ${field} ${minimumText}`,
        fix: `Set pinnedFliskVersion to ${minimumText} or a newer version, or lower ${field} deliberately.`
      };
    }
  }
  const current = parseExactVersion(currentVersion);
  if (current && compareVersions(pin.parts, current.parts) === 0) {
    return {
      status: "ok",
      required: pin.value
    };
  }
  return {
    status: "mismatch",
    required: pin.value,
    current: currentVersion,
    message: `flisk ${currentVersion} does not match pinnedFliskVersion ${pin.value} in .flisk/project.json`,
    fix: [
      `Run: npm install -g @flisk-sh/flisk@${pin.value}`,
      "To move the pin deliberately, edit pinnedFliskVersion in .flisk/project.json."
    ].join("\n")
  };
}

export {
  evaluateFliskVersion
};
