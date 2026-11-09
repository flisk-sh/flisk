// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { EventEmitter } from "node:events";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { cliInvocation } from "../cli-invocation.js";
import { initializeProject, runStackQuiet } from "../one-command.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "test-support" ? [] : sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });
}

describe("cliInvocation", () => {
  it("re-runs a script with its interpreter", () => {
    expect(cliInvocation("/usr/bin/node", "/opt/flisk/bin/flisk.js", () => true)).toEqual([
      "/usr/bin/node",
      "/opt/flisk/bin/flisk.js",
    ]);
  });

  it("runs a compiled binary alone, because its argv[1] is a virtual path", () => {
    expect(cliInvocation("/usr/local/bin/flisk", "/$bunfs/root/flisk", () => false)).toEqual([
      "/usr/local/bin/flisk",
    ]);
    expect(cliInvocation("C:\\flisk.exe", "B:\\~BUN\\root\\flisk.exe", () => false)).toEqual([
      "C:\\flisk.exe",
    ]);
  });

  it("falls back to the executable when there is no script", () => {
    expect(cliInvocation("/usr/local/bin/flisk", "")).toEqual(["/usr/local/bin/flisk"]);
  });
});

describe("re-running the compiled binary", () => {
  function spawnThatCloses() {
    const child = Object.assign(new EventEmitter(), {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      unref: vi.fn(),
    });
    queueMicrotask(() => child.emit("close", 0));
    return vi.fn(() => child);
  }

  it("never passes the virtual path to the child", async () => {
    const setup = spawnThatCloses();
    await initializeProject(["/usr/local/bin/flisk"], "/p", {}, setup as never);
    expect(setup).toHaveBeenCalledWith(
      "/usr/local/bin/flisk",
      ["project", "--yes", "--quiet"],
      expect.anything(),
    );

    const stack = spawnThatCloses();
    await runStackQuiet(["/usr/local/bin/flisk"], "/p", {}, stack as never);
    expect(stack).toHaveBeenCalledWith("/usr/local/bin/flisk", ["up", "--json"], expect.anything());
  });

  it("every self re-run in the CLI goes through cliInvocation", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => /process\.execPath,\s*\[/.test(readFileSync(file, "utf-8")))
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
