// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECT_JSON } from "./constants.js";

type FloorWarning = {
  deprecationWarning?: string;
};

type MinimumVersionField = "minFliskVersion" | "minTdkVersion";

interface MinimumVersionConfig {
  value: unknown;
  field?: MinimumVersionField;
  deprecationWarning?: string;
}

export type FliskVersionFloor =
  | ({ status: "none" } & FloorWarning)
  | ({ status: "ok"; required: string } & FloorWarning)
  | ({
      status: "too-old";
      required: string;
      message: string;
      fix: string;
    } & FloorWarning)
  | ({ status: "malformed"; message: string; fix: string } & FloorWarning);

export type FliskVersionPin =
  | { status: "none" }
  | { status: "ok"; required: string }
  | {
      status: "mismatch";
      required: string;
      current: string;
      message: string;
      fix: string;
    }
  | { status: "malformed"; message: string; fix: string };

export type FliskVersionEvaluation =
  | {
      status: "none";
      deprecationWarning?: string;
    }
  | {
      status: "ok";
      source: "pin" | "floor";
      required: string;
      deprecationWarning?: string;
    }
  | {
      status: "malformed" | "too-old" | "mismatch";
      message: string;
      fix: string;
      required?: string;
      deprecationWarning?: string;
    };

/**
 * Evaluates both the repository's minimum supported CLI version and exact pin.
 * An exact pin takes precedence over a floor mismatch because it provides
 * the correct version to install. A malformed floor remains a configuration error.
 */
export function evaluateFliskVersion(
  projectRoot: string,
  currentVersion: string,
): FliskVersionEvaluation {
  const floor = evaluateFliskVersionFloor(projectRoot, currentVersion);
  const pin = evaluateFliskVersionPin(projectRoot, currentVersion);

  const warning = floor.deprecationWarning ? { deprecationWarning: floor.deprecationWarning } : {};

  if (floor.status === "malformed") {
    return {
      status: "malformed",
      message: floor.message,
      fix: floor.fix,
      ...warning,
    };
  }

  if (pin.status === "malformed") {
    return {
      status: "malformed",
      message: pin.message,
      fix: pin.fix,
      ...warning,
    };
  }

  if (pin.status === "mismatch") {
    return {
      status: "mismatch",
      required: pin.required,
      message: pin.message,
      fix: pin.fix,
      ...warning,
    };
  }

  if (floor.status === "too-old") {
    return {
      status: "too-old",
      required: floor.required,
      message: floor.message,
      fix: floor.fix,
      ...warning,
    };
  }

  if (pin.status === "ok") {
    return {
      status: "ok",
      source: "pin",
      required: pin.required,
      ...warning,
    };
  }

  if (floor.status === "ok") {
    return {
      status: "ok",
      source: "floor",
      required: floor.required,
      ...warning,
    };
  }

  return {
    status: "none",
    ...warning,
  };
}

function toParts(raw: string): number[] | null {
  const match = raw.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;

  const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function compareVersions(left: number[], right: number[]): number {
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }

  return 0;
}

function readProjectConfig(projectRoot: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(join(projectRoot, ".flisk", PROJECT_JSON), "utf-8"),
    );

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return undefined;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the canonical minimum version and its deprecated legacy alias.
 * minFliskVersion always takes precedence when both fields are present.
 */
function resolveMinimumVersion(project: Record<string, unknown>): MinimumVersionConfig {
  const canonical = project.minFliskVersion;
  const legacy = project.minTdkVersion;

  if (canonical !== undefined) {
    return {
      value: canonical,
      field: "minFliskVersion",
      ...(legacy !== undefined
        ? {
            deprecationWarning:
              "minTdkVersion is deprecated and ignored because minFliskVersion is set. Remove minTdkVersion from .flisk/project.json.",
          }
        : {}),
    };
  }

  if (legacy !== undefined) {
    return {
      value: legacy,
      field: "minTdkVersion",
      deprecationWarning:
        "minTdkVersion is deprecated. Use minFliskVersion in .flisk/project.json instead.",
    };
  }

  return { value: undefined };
}

function parseExactVersion(raw: unknown): { value: string; parts: number[] } | null {
  if (typeof raw !== "string" || !/^\d+\.\d+\.\d+$/.test(raw)) {
    return null;
  }

  const parts = raw.split(".").map(Number);

  if (!parts.every(Number.isSafeInteger)) {
    return null;
  }

  return { value: raw, parts };
}

/**
 * A repo can pin the oldest CLI it works with:
 * `"minFliskVersion": "1.3.80"` in .flisk/project.json.
 * `minTdkVersion` remains supported as a deprecated alias for one release.
 * Shared by `flisk doctor` and `flisk up` so both say the same thing.
 */
export function evaluateFliskVersionFloor(
  projectRoot: string,
  currentVersion: string,
): FliskVersionFloor {
  const project = readProjectConfig(projectRoot);
  if (!project) return { status: "none" };

  const minimumConfig = resolveMinimumVersion(project);
  const minimum = minimumConfig.value;
  const field = minimumConfig.field ?? "minFliskVersion";
  const warning = minimumConfig.deprecationWarning
    ? { deprecationWarning: minimumConfig.deprecationWarning }
    : {};

  if (minimum === undefined) {
    return { status: "none", ...warning };
  }

  const required = typeof minimum === "string" ? toParts(minimum) : null;

  if (!required) {
    return {
      status: "malformed",
      message: `.flisk/project.json ${field} ${JSON.stringify(minimum)} is not a version like "1.3.80"`,
      fix: 'Set minFliskVersion to a MAJOR.MINOR.PATCH string, for example "1.3.80".',
      ...warning,
    };
  }

  // The running CLI may be a prerelease or v-prefixed build; only the pinned floor is strict.
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
      ...warning,
    };
  }

  return {
    status: "ok",
    required: requiredText,
    ...warning,
  };
}

/**
 * A repository can require one exact CLI version through
 * `pinnedFliskVersion` in .flisk/project.json.
 */
export function evaluateFliskVersionPin(
  projectRoot: string,
  currentVersion: string,
): FliskVersionPin {
  const project = readProjectConfig(projectRoot);

  if (!project || project.pinnedFliskVersion === undefined) {
    return { status: "none" };
  }

  const pin = parseExactVersion(project.pinnedFliskVersion);

  if (!pin) {
    return {
      status: "malformed",
      message: `.flisk/project.json pinnedFliskVersion ${JSON.stringify(project.pinnedFliskVersion)} is not a version like "1.3.80"`,
      fix: 'Set pinnedFliskVersion to a MAJOR.MINOR.PATCH string, for example "1.3.80".',
    };
  }

  const minimumConfig = resolveMinimumVersion(project);

  if (minimumConfig.value !== undefined) {
    const minimumText = typeof minimumConfig.value === "string" ? minimumConfig.value.trim() : "";

    const minimumParts = /^\d+\.\d+\.\d+$/.test(minimumText) ? toParts(minimumText) : null;

    if (minimumParts && compareVersions(pin.parts, minimumParts) < 0) {
      const field = minimumConfig.field ?? "minFliskVersion";

      return {
        status: "malformed",
        message: `pinnedFliskVersion ${pin.value} is lower than ${field} ${minimumText}`,
        fix: `Set pinnedFliskVersion to ${minimumText} or a newer version, or lower ${field} deliberately.`,
      };
    }
  }

  const current = parseExactVersion(currentVersion);

  if (current && compareVersions(pin.parts, current.parts) === 0) {
    return {
      status: "ok",
      required: pin.value,
    };
  }

  return {
    status: "mismatch",
    required: pin.value,
    current: currentVersion,
    message: `flisk ${currentVersion} does not match pinnedFliskVersion ${pin.value} in .flisk/project.json`,
    fix: [
      `Run: npm install -g @flisk-sh/flisk@${pin.value}`,
      "To move the pin deliberately, edit pinnedFliskVersion in .flisk/project.json.",
    ].join("\n"),
  };
}
