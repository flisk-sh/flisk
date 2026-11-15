// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Watch-mode build: runs `tsc --watch` and refreshes `command-specs.generated.ts` after each
 * clean compilation. `generate-command-specs.mjs --no-compile` writes only when specs actually
 * change, which triggers one follow-up `tsc --watch` pass and then settles without looping (#4212).
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(here, "..");
const tscBin = join(cliDir, "node_modules", "typescript", "bin", "tsc");
const generator = join(here, "generate-command-specs.mjs");

export function createWatchOutputHandler(onCleanCompile) {
  let buffer = "";
  let cleanCompile = false;
  return (chunk) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.includes("Starting compilation") || line.includes("File change detected")) {
        cleanCompile = false;
      } else if (line.includes("Found 0 errors.")) {
        cleanCompile = true;
      }
      if (cleanCompile && line.includes("Watching for file changes.")) {
        cleanCompile = false;
        onCleanCompile();
      }
    }
  };
}

export function startWatchBuild() {
  let regenerating = false;
  let pending = false;

  function refreshSpecs() {
    if (regenerating) {
      pending = true;
      return;
    }
    regenerating = true;
    try {
      spawnSync(process.execPath, [generator, "--no-compile"], {
        cwd: cliDir,
        stdio: "inherit",
      });
    } finally {
      regenerating = false;
      if (pending) {
        pending = false;
        refreshSpecs();
      }
    }
  }

  const tsc = spawn(process.execPath, [tscBin, "--watch", "--preserveWatchOutput"], {
    cwd: cliDir,
    stdio: ["inherit", "pipe", "inherit"],
  });

  const handleOutput = createWatchOutputHandler(refreshSpecs);
  tsc.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    handleOutput(chunk);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => tsc.kill(signal));
  }
  tsc.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startWatchBuild();
}
