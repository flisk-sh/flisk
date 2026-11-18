// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

function project(): string {
  return createTempProject({
    stacks: {
      app: { gateway: { appType: "backend", port: 3100 } },
      web: { frontend: { appType: "frontend", port: 3000 } },
    },
  });
}

describe("flisk stacks with one stack", () => {
  it("lists only the named stack with a positional argument", () => {
    const result = runFlisk(["stacks", "app"], { cwd: project() });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("app");
    expect(result.stdout).not.toContain("web");
  });

  it("lists only the named stack with --stack", () => {
    const result = runFlisk(["stacks", "--stack", "app"], { cwd: project() });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("app");
    expect(result.stdout).not.toContain("web");
  });

  it("returns one stack from --json with a positional argument", () => {
    const result = runFlisk(["stacks", "app", "--json"], { cwd: project() });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseEnvelope(result.stdout).data.stacks).toEqual([{ name: "app", resourceCount: 1 }]);
  });

  it("returns one stack from --json with --stack", () => {
    const result = runFlisk(["stacks", "--stack", "app", "--json"], { cwd: project() });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(parseEnvelope(result.stdout).data.stacks).toEqual([{ name: "app", resourceCount: 1 }]);
  });

  it("lists every stack with no argument", () => {
    const result = runFlisk(["stacks", "--json"], { cwd: project() });
    expect(result.status).toBe(0);
    expect(parseEnvelope(result.stdout).data.stacks.map((s: { name: string }) => s.name)).toEqual([
      "app",
      "web",
    ]);
  });

  it("fails clearly for an unknown stack, naming the available stacks", () => {
    const result = runFlisk(["stacks", "apps"], { cwd: project() });
    expect(result.status).toBe(1);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toContain('Stack "apps" not found');
    expect(combined).toContain('Did you mean "app"?');
    expect(combined).toContain("Stacks: app, web");
  });

  it("rejects a positional stack together with --stack", () => {
    const result = runFlisk(["stacks", "app", "--stack", "web"], { cwd: project() });
    expect(result.status).toBe(1);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toContain("Choose one of [stack] and --stack <name>");
  });

  it("treats an empty positional stack as a named stack", () => {
    const result = runFlisk(["stacks", ""], { cwd: project() });
    expect(result.status).toBe(1);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toContain('Stack "" not found');
  });

  it("treats an empty --stack value as a named stack", () => {
    const result = runFlisk(["stacks", "--stack", ""], { cwd: project() });
    expect(result.status).toBe(1);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toContain('Stack "" not found');
  });

  it("returns a machine error envelope for an unknown stack in --json", () => {
    const result = runFlisk(["stacks", "missing", "--json"], { cwd: project() });
    expect(result.status).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data).toBeNull();
    expect(envelope.errors[0].message).toBe('Stack "missing" not found');
  });

  it("documents the stack argument in help", () => {
    const result = runFlisk(["stacks", "--help"], { cwd: project() });
    const text = `${result.stdout}\n${result.stderr}`;
    expect(text).toContain("[stack]");
    expect(text).toContain("--stack <name>");
    expect(text).toContain("flisk stacks app");
  });
});
