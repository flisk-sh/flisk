// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanEnv,
  createTempProject,
  fliskBin,
  parseEnvelope,
  runFlisk,
} from "../../test-support/index.js";

/** Keep stdin open without supplying input, as an agent calling the CLI would. */
function runWithOpenStdin(
  root: string,
  args: string[],
): Promise<{ status: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fliskBin, "resource", ...args], {
      cwd: root,
      env: cleanEnv({ NO_COLOR: "1" }),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Resource command waited on open stdin: ${output}`));
    }, 5000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      resolve({ status, output });
    });
  });
}

describe("resource creation input safeguards", () => {
  it.each([{ args: [] }, { args: ["api"] }, { args: ["api", "--stack", "main"] }])(
    "fails without waiting for a non-terminal stdin ($args)",
    async ({ args }) => {
      const root = createTempProject();
      const result = await runWithOpenStdin(root, args);
      expect(result.status).toBe(1);
      expect(result.output).toContain("--yes or a terminal");
      expect(readdirSync(root)).toEqual([".flisk"]);
    },
  );

  it.each([
    "list",
    "ls",
    "status",
    "help",
    "create",
    "add",
    "get",
    "show",
    "remove",
    "rm",
    "delete",
    "update",
    "edit",
  ])("rejects command-like name %s even with --yes", (name) => {
    const root = createTempProject();
    const result = runFlisk(["resource", name, "--yes"], { cwd: root, input: "" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Resource name "${name}" looks like a command`);
    expect(result.stderr).toContain("flisk ");
    expect(readdirSync(root)).toEqual([".flisk"]);
  });

  it("rejects list before reaching a prompt with open stdin", async () => {
    const root = createTempProject();
    const result = await runWithOpenStdin(root, ["list"]);
    expect(result.status).toBe(1);
    expect(result.output).toContain("flisk resources");
    expect(result.output).not.toContain("Assign to stack:");
  });

  it("returns the command hint in a JSON error envelope", () => {
    const root = createTempProject();
    const result = runFlisk(["resource", "status", "--json"], { cwd: root, input: "" });
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout).errors[0].message).toContain("flisk status --json");
    expect(readdirSync(root)).toEqual([".flisk"]);
  });

  it.each(["--yes", "--json"])("creates a named resource without a terminal using %s", (flag) => {
    const root = createTempProject();
    const result = runFlisk(["resource", "api-list", "--stack", "main", flag], {
      cwd: root,
      input: "",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(
      JSON.parse(readFileSync(join(root, "services/main/api-list/service.json"), "utf8")).appName,
    ).toBe("api-list");
  });

  it("allows the read-only framework inventory without --yes", () => {
    const root = createTempProject();
    const result = runFlisk(["resource", "--frameworks"], { cwd: root, input: "" });
    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(root)).toEqual([".flisk"]);
  });

  it("does not treat inherited object keys as reserved commands", () => {
    const root = createTempProject();
    const result = runFlisk(["resource", "constructor", "--stack", "main", "--yes"], {
      cwd: root,
      input: "",
    });
    expect(result.status, result.stderr).toBe(0);
  });
});
