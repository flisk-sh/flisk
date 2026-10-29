// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runFlisk } from "../../test-support/index.js";

/** Found by the CLI fuzz tier (tests/chaos/cli): an async action that threw ended as an unhandled rejection with a raw stack. */
describe("a project.json that cannot be read", () => {
  it.each(["networks", "stacks", "resources", "status"])(
    "makes `flisk %s` fail with one error line, not a runtime stack trace",
    (command) => {
      const dir = createTempDir("corrupt-project");
      mkdirSync(join(dir, ".flisk"));
      writeFileSync(join(dir, ".flisk/project.json"), "{");
      const result = runFlisk([command], { cwd: dir });
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.status, output).not.toBeNull();
      expect(output).not.toMatch(/\n\s+at .+:\d+:\d+|node:internal|Bun v\d/);
    },
  );
});

describe("flisk resource <name> when another service.json already uses that name", () => {
  it("refuses it instead of creating a second service with the same appName", () => {
    const dir = createTempDir("duplicate-resource-name");
    expect(runFlisk(["project", "--yes", "--no-agent-skills"], { cwd: dir }).status).toBe(0);
    expect(runFlisk(["resource", "audit", "--yes", "--stack", "shop"], { cwd: dir }).status).toBe(
      0,
    );
    renameSync(join(dir, "services/shop/audit"), join(dir, "services/shop/audit-old"));
    const again = runFlisk(["resource", "audit", "--yes", "--stack", "shop"], { cwd: dir });
    expect(again.status).toBe(1);
    expect(`${again.stdout}${again.stderr}`).toMatch(/already exists at services\/shop\/audit-old/);
    expect(existsSync(join(dir, "services/shop/audit"))).toBe(false);
  });
});
