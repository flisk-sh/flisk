// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { spawn } from "node:child_process";

/** The marker the stack prints before the frontend URLs. */
const FRONTEND_MARKER = "Frontend URLs";

/** Picks the first frontend URL out of the `flisk up` output, if it printed one. */
export function findFrontendUrl(output: string): string | undefined {
  const lines = output.split("\n");
  const markerIndex = lines.findIndex((line) => line.includes(FRONTEND_MARKER));
  if (markerIndex === -1) return undefined;
  for (const line of lines.slice(markerIndex + 1)) {
    const match = line.match(/^\s*-\s+\S+:\s+(https?:\/\/\S+)/);
    if (match) return match[1];
    if (line.trim() === "" || line.includes("URLs:")) break;
  }
  return undefined;
}

export type StackOutcome = {
  /** True when the stack came up and its services are healthy. */
  ok: boolean;
  /** The message from the stack when it did not come up. */
  error?: string;
  /** Everything the stack printed, kept for the failure message. */
  raw: string;
};

interface MachineEnvelope {
  data?: { ok?: boolean } | null;
  errors?: { code?: string; message?: string }[];
}

/** Reads the `{schemaVersion, data, errors}` envelope `flisk up --json` prints when it is done. */
export function parseStackEnvelope(output: string): StackOutcome | undefined {
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as MachineEnvelope;
      const data = parsed.data ?? {};
      const ok = data.ok === true;
      return {
        ok,
        error: ok ? undefined : (parsed.errors?.[0]?.message ?? "the stack did not come up"),
        raw: output,
      };
    } catch {
      // Not the envelope; keep looking.
    }
  }
  return undefined;
}

/**
 * Starts the stack quietly and reports when it is ready.
 *
 * `flisk up --json` prints one JSON object when the stack is up (or has failed) and keeps
 * Tilt's own build logs out of the way, so the caller can show a progress line instead of
 * thousands of Docker and Traefik lines. The stack keeps running in the background.
 */
export function runStackQuiet(
  binPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  spawnFn: typeof spawn = spawn,
): Promise<StackOutcome> {
  return new Promise((resolve) => {
    const child = spawnFn(process.execPath, [binPath, "up", "--json"], {
      cwd,
      env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    const settle = (outcome: StackOutcome) => {
      if (settled) return;
      settled = true;
      // The stack outlives this command: let the child run on its own.
      child.unref?.();
      resolve(outcome);
    };
    child.stdout?.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
      const envelope = parseStackEnvelope(output);
      if (envelope) settle(envelope);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      output += String(chunk);
    });
    child.on("error", (error) => settle({ ok: false, error: error.message, raw: output }));
    child.on("close", (code) =>
      settle({
        ok: false,
        error: `the stack stopped before it was ready (code ${code})`,
        raw: output,
      }),
    );
  });
}

/**
 * A free directory for the project. A second demo in the same folder gets its own directory
 * (`name-2`, `name-3`, ...) instead of failing because the first one is still there.
 */
export function nextAvailableProjectDir(
  base: string,
  isTaken: (candidate: string) => boolean,
): string {
  if (!isTaken(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }
  return base;
}
