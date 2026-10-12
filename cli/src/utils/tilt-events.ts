// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import type { TiltCommandResult } from "../types/index.js";
import { STANDARD_PORTS } from "./constants.js";
import { runTilt } from "./tilt.js";

type JsonRecord = Record<string, unknown>;
export type TiltTimelineKind = "running" | "failed" | "warning" | "success" | "status";

export interface TiltResourceSummary {
  name: string;
  runtimeStatus?: string;
  updateStatus?: string;
  hasPendingChanges?: boolean;
}

export interface TiltTimelineEvent {
  id: string;
  resourceName: string;
  kind: TiltTimelineKind;
  title: string;
  occurredAt?: string;
  details?: string;
}

export interface TiltEventSnapshot {
  resources: TiltResourceSummary[];
  events: TiltTimelineEvent[];
}

export type TiltEventsFailureKind = "unavailable" | "error";

export class TiltEventsLoadError extends Error {
  constructor(
    message: string,
    readonly kind: TiltEventsFailureKind,
  ) {
    super(message);
    this.name = "TiltEventsLoadError";
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

// Tilt-controlled text is rendered in the terminal, so drop ANSI/OSC escape sequences and
// other control characters (keeping tab/newline for later whitespace normalization).
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);
const ANSI_SEQUENCE = new RegExp(
  `${ESC}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)?|[@-Z\\\\-_])`,
  "g",
);
// A regex literal would trip noControlCharactersInRegex, so this stays a string; keep the autofix from rewriting it.
// biome-ignore lint/complexity/useRegexLiterals: the control-character range must stay in a string
const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f]", "g");

export function stripTerminalControls(value: string): string {
  return value.replace(ANSI_SEQUENCE, "").replace(CONTROL_CHARS, "");
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = stripTerminalControls(value).trim();
  return cleaned || undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const cleaned = readString(item);
        return cleaned ? [cleaned] : [];
      })
    : [];
}

export function parseTiltUiResourceList(value: unknown): TiltEventSnapshot {
  const list = asRecord(value);
  if (!list || !Array.isArray(list.items)) {
    throw new Error("Tilt returned an invalid UIResource list");
  }
  const resources: TiltResourceSummary[] = [];
  const events: TiltTimelineEvent[] = [];

  for (const value of list.items) {
    const item = asRecord(value);
    const metadata = asRecord(item?.metadata);
    const resourceName = readString(metadata?.name);
    if (!item || !resourceName) continue;
    const status = asRecord(item.status);
    resources.push({
      name: resourceName,
      runtimeStatus: readString(status?.runtimeStatus),
      updateStatus: readString(status?.updateStatus),
      hasPendingChanges:
        typeof status?.hasPendingChanges === "boolean" ? status.hasPendingChanges : undefined,
    });

    const history = Array.isArray(status?.buildHistory) ? status.buildHistory : [];
    for (const [buildIndex, value] of history.entries()) {
      const build = asRecord(value);
      if (!build) continue;
      const error = readString(build.error);
      const warnings = readStringArray(build.warnings);
      const details = [error, ...warnings].filter((entry): entry is string => Boolean(entry));
      const spanId = readString(build.spanID);
      events.push({
        id: `${resourceName}:build:${spanId ?? String(buildIndex)}`,
        resourceName,
        kind: error ? "failed" : warnings.length ? "warning" : "success",
        title: error
          ? "Build failed"
          : warnings.length
            ? "Build completed with warnings"
            : "Build completed",
        occurredAt: readString(build.finishTime) ?? readString(build.startTime),
        details: details.length ? details.join("; ") : undefined,
      });
    }

    const currentBuild = asRecord(status?.currentBuild);
    if (currentBuild) {
      events.push({
        id: `${resourceName}:current-build`,
        resourceName,
        kind: "running",
        title: "Build in progress",
        occurredAt: readString(currentBuild.startTime),
      });
    }
    const pendingSince = readString(status?.pendingBuildSince);
    if (!currentBuild && (status?.queued === true || pendingSince)) {
      events.push({
        id: `${resourceName}:queued`,
        resourceName,
        kind: "warning",
        title: "Update queued",
        occurredAt: pendingSince,
      });
    }
    const lastDeployTime = readString(status?.lastDeployTime);
    const deployTimestamp = lastDeployTime ? Date.parse(lastDeployTime) : Number.NaN;
    const matchingBuild = events.some(
      (event) =>
        event.resourceName === resourceName &&
        event.kind === "success" &&
        event.occurredAt !== undefined &&
        Date.parse(event.occurredAt) === deployTimestamp,
    );
    if (lastDeployTime && !matchingBuild) {
      events.push({
        id: `${resourceName}:last-deploy`,
        resourceName,
        kind: "success",
        title: "Last deployed",
        occurredAt: lastDeployTime,
      });
    }

    const conditions = Array.isArray(status?.conditions) ? status.conditions : [];
    for (const [conditionIndex, value] of conditions.entries()) {
      const condition = asRecord(value);
      if (!condition) continue;
      const type = readString(condition.type);
      const state = readString(condition.status);
      const reason = readString(condition.reason);
      const message = readString(condition.message);
      if ((!type && !reason && !message) || (state === "True" && !reason && !message)) continue;
      const detail = [reason, message]
        .filter((entry): entry is string => Boolean(entry))
        .join(": ");
      events.push({
        id: `${resourceName}:condition:${conditionIndex}:${type ?? "status"}`,
        resourceName,
        kind: state === "False" ? "warning" : "status",
        title: `Condition ${type ?? "status"}${state ? `: ${state}` : ""}`,
        occurredAt: readString(condition.lastTransitionTime),
        details: detail || undefined,
      });
    }
  }

  events.sort((left, right) => {
    if (left.kind === "running" && right.kind !== "running") return -1;
    if (right.kind === "running" && left.kind !== "running") return 1;
    const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : Number.NaN;
    const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : Number.NaN;
    if (Number.isNaN(leftTime)) {
      return Number.isNaN(rightTime) ? left.resourceName.localeCompare(right.resourceName) : 1;
    }
    if (Number.isNaN(rightTime)) return -1;
    return rightTime - leftTime;
  });
  return { resources, events };
}

export async function loadTiltEvents(): Promise<TiltEventSnapshot> {
  const port = process.env.TILT_PORT ?? String(STANDARD_PORTS.tiltUi);
  let result: TiltCommandResult;
  try {
    result = await runTilt("get", ["uiresources", "-o", "json", "--port", port], {
      inheritStdio: false,
      timeoutMs: 10_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind: TiltEventsFailureKind =
      /ENOENT|not found|no such file|connection refused|failed to connect|could not connect|unable to connect|Tilt is not running/i.test(
        message,
      )
        ? "unavailable"
        : "error";
    throw new TiltEventsLoadError(message, kind);
  }
  if (result.exitCode !== 0) {
    const message = result.stderr.trim() || `tilt get exited with code ${result.exitCode}`;
    const kind: TiltEventsFailureKind =
      /connection refused|failed to connect|could not connect|unable to connect|Tilt is not running|no running Tilt/i.test(
        message,
      )
        ? "unavailable"
        : "error";
    throw new TiltEventsLoadError(message, kind);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout) as unknown;
  } catch {
    throw new TiltEventsLoadError("Tilt returned invalid UIResource JSON", "error");
  }
  try {
    return parseTiltUiResourceList(parsed);
  } catch (error) {
    throw new TiltEventsLoadError(
      error instanceof Error ? error.message : "Tilt returned an invalid UIResource list",
      "error",
    );
  }
}
