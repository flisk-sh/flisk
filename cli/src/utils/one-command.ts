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

export type StackRunResult = { code: number | null; output: string };

/**
 * Runs `flisk up` in the project directory and returns its output. The output is streamed to
 * the terminal as it arrives, so the stack keeps its live progress.
 */
export function runStack(
  binPath: string,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  spawnFn: typeof spawn = spawn,
): Promise<StackRunResult> {
  return new Promise((resolve) => {
    const child = spawnFn(process.execPath, [binPath, "up"], {
      cwd,
      env,
      stdio: ["inherit", "pipe", "inherit"],
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = String(chunk);
      output += text;
      process.stdout.write(text);
    });
    child.on("error", (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
    child.on("close", (code) => resolve({ code, output }));
  });
}
