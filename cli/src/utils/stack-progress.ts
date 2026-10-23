// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { execFile } from "node:child_process";

export interface StackProgress {
  /** Resources that are up. */
  ready: number;
  /** Resources Tilt is still working on. */
  building: number;
  /** Resources that have not started yet. */
  pending: number;
  /** Resources that failed. */
  failed: number;
  /** Every resource Tilt knows about. */
  total: number;
  /** The resources that are still working, with their state. */
  working: { name: string; state: string }[];
  /** The resources that failed, with the reason. */
  broken: { name: string; message: string }[];
  /** How long the stack has been coming up, in seconds. */
  elapsed: number;
}

/** Runs `tilt get uiresources` and returns its JSON, or null when Tilt does not answer. */
export type TiltResourceReader = (port: number) => Promise<string | null>;

const defaultTiltResourceReader: TiltResourceReader = (port) =>
  new Promise<string | null>((resolve) => {
    execFile(
      "tilt",
      ["get", "uiresources", "-o", "json", "--port", String(port)],
      { timeout: 15_000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => resolve(error ? null : stdout),
    );
  });

/** Reads the resource states from the Tilt UI API. */
export async function readStackProgress(
  port: number,
  read: TiltResourceReader = defaultTiltResourceReader,
): Promise<Omit<StackProgress, "elapsed"> | undefined> {
  const json = await read(port);
  if (!json) return undefined;

  let items: {
    metadata?: { name?: string };
    status?: {
      updateStatus?: string;
      runtimeStatus?: string;
      buildHistory?: { error?: string }[];
    };
  }[] = [];
  try {
    const parsed = JSON.parse(json) as { items?: typeof items };
    items = parsed.items ?? [];
  } catch {
    return undefined;
  }

  const working: StackProgress["working"] = [];
  const broken: StackProgress["broken"] = [];
  let ready = 0;
  let building = 0;
  let pending = 0;
  let failed = 0;

  for (const item of items) {
    const name = item.metadata?.name ?? "unknown";
    const update = item.status?.updateStatus ?? "";
    const runtime = item.status?.runtimeStatus ?? "";
    if (update === "error" || runtime === "error") {
      failed += 1;
      broken.push({
        name,
        message: (item.status?.buildHistory?.[0]?.error ?? "the resource failed")
          .replace(/\s+/g, " ")
          .slice(0, 160),
      });
      continue;
    }
    if (update === "ok" && (runtime === "ok" || runtime === "not_applicable" || runtime === "")) {
      ready += 1;
      continue;
    }
    if (update === "pending" || update === "") {
      pending += 1;
      working.push({ name, state: runtime || "pending" });
      continue;
    }
    building += 1;
    working.push({ name, state: update });
  }

  return { ready, building, pending, failed, total: items.length, working, broken };
}

/** A one-line summary of the progress, for the progress line. */
export function formatProgress(progress: StackProgress): string {
  const minutes = Math.floor(progress.elapsed / 60);
  const seconds = Math.round(progress.elapsed % 60);
  const elapsed = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  const parts = [`${progress.ready}/${progress.total} resources ready`, elapsed];
  if (progress.building > 0) parts.push(`${progress.building} building`);
  if (progress.pending > 0) parts.push(`${progress.pending} queued`);
  if (progress.failed > 0) parts.push(`${progress.failed} failed`);
  return parts.join(" · ");
}
