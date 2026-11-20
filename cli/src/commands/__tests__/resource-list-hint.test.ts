// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createTempProject, runFlisk } from "../../test-support/index.js";

describe("flisk resource --list points at flisk resources (#4377)", () => {
  it("names flisk resources for --list", () => {
    const root = createTempProject();
    const result = runFlisk(["resource", "--list"], { cwd: root, input: "" });
    expect(result.status).toBe(2);
    expect(`${result.stdout}\n${result.stderr}`).toContain("flisk resources");
  });

  it("names flisk resources for -l", () => {
    const root = createTempProject();
    const result = runFlisk(["resource", "-l"], { cwd: root, input: "" });
    expect(result.status).toBe(2);
    expect(`${result.stdout}\n${result.stderr}`).toContain("flisk resources");
  });

  it("names flisk resources for the positional 'list'", () => {
    const root = createTempProject();
    const result = runFlisk(["resource", "list", "--yes"], { cwd: root, input: "" });
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("flisk resources");
  });

  it("keeps --json behaviour (envelope on stdout, no prose) for --list", () => {
    const root = createTempProject();
    const result = runFlisk(["resource", "--list", "--json"], { cwd: root, input: "" });
    expect(result.status).toBe(2);
    expect(result.stdout).not.toContain("To list resources");
  });
});
