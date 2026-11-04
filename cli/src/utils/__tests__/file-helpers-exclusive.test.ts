// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeFilesWithProgress } from "../file-helpers.js";

describe("writeFilesWithProgress with exclusive", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes new files, nested folders included", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const dir = mkdtempSync(join(tmpdir(), "flisk-exclusive-"));
    dirs.push(dir);
    writeFilesWithProgress(
      dir,
      [
        { type: "json", filename: "service.json", content: { a: 1 }, description: "s", emoji: "-" },
        { type: "text", filename: "src/index.ts", content: "x", description: "i", emoji: "-" },
      ],
      undefined,
      { exclusive: true },
    );
    expect(JSON.parse(readFileSync(join(dir, "service.json"), "utf8"))).toEqual({ a: 1 });
    expect(readFileSync(join(dir, "src", "index.ts"), "utf8")).toBe("x");
  });

  it("never overwrites a file that is already there, and names it", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const dir = mkdtempSync(join(tmpdir(), "flisk-exclusive-"));
    dirs.push(dir);
    writeFileSync(join(dir, "package.json"), "theirs");
    expect(() =>
      writeFilesWithProgress(
        dir,
        [{ type: "text", filename: "package.json", content: "ours", description: "p", emoji: "-" }],
        undefined,
        { exclusive: true },
      ),
    ).toThrow(/package\.json appeared while it was being created/);
    expect(readFileSync(join(dir, "package.json"), "utf8")).toBe("theirs");
  });
});
