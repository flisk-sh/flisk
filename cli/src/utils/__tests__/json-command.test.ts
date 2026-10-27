// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureExit } from "../../test-support/index.js";
import { FliskError, ProcessExitError, showError } from "../errors.js";
import {
  failureFromStderr,
  JsonCommandError,
  type JsonCommandResult,
  runJsonCommand,
} from "../json-command.js";

/** Runs `runJsonCommand` with stdout and stderr captured, and returns what each received and the exit code. */
async function run(
  action: () => Promise<JsonCommandResult>,
): Promise<{ stdout: string; stderr: string; exitCode: number | undefined; level: number }> {
  const exit = captureExit();
  let stdout = "";
  let stderr = "";
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  }) as never);
  vi.spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  }) as never);
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr += `${args.map(String).join(" ")}\n`;
  });
  let level = -1;
  try {
    await runJsonCommand("TEST_FAILED", "flisk test", async () => {
      level = chalk.level;
      return action();
    });
  } catch (error) {
    if (!(error instanceof ProcessExitError)) throw error;
  }
  return { stdout, stderr, exitCode: exit.exit.mock.calls[0]?.[0], level };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runJsonCommand", () => {
  it("prints the action's data as the only line on stdout and sends human output to stderr", async () => {
    const logBefore = console.log;
    const levelBefore = chalk.level;
    const result = await run(async () => {
      console.log(chalk.green("✅ Created"));
      console.info("info line");
      console.log();
      process.stdout.write("raw line\n");
      return { data: { ok: true } };
    });
    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toBe('{"schemaVersion":1,"data":{"ok":true},"errors":[]}\n');
    expect(result.stderr).toContain("✅ Created");
    expect(result.stderr).toContain("info line");
    expect(result.stderr).toContain("raw line");
    // Colour is off while the action runs and comes back afterwards.
    expect(result.level).toBe(0);
    expect(result.stderr).not.toContain("\u001b[");
    expect(chalk.level).toBe(levelBefore);
    expect(console.log).toBe(logBefore);
  });

  it("reports a thrown FliskError as COMMAND_FAILED with its suggestions and exit code", async () => {
    const result = await run(async () => {
      throw new FliskError("Resource not found", ["Run flisk resources"], 3);
    });
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      data: null,
      errors: [
        {
          code: "COMMAND_FAILED",
          message: "Resource not found",
          suggestions: ["Run flisk resources"],
        },
      ],
    });
    expect(result.stderr).toContain("Resource not found");
  });

  it("keeps a JsonCommandError's own code and prints its message to stderr once", async () => {
    const result = await run(async () => {
      console.error("Nothing to import");
      throw new JsonCommandError("IMPORT_FAILED", "Nothing to import", ["Check the file"], 4);
    });
    expect(result.exitCode).toBe(4);
    expect(JSON.parse(result.stdout).errors).toEqual([
      { code: "IMPORT_FAILED", message: "Nothing to import", suggestions: ["Check the file"] },
    ]);
    expect(result.stderr.match(/Nothing to import/g)).toHaveLength(1);
  });

  it("reports an unexpected error as INTERNAL and exits 2", async () => {
    const result = await run(async () => {
      throw new Error("boom");
    });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout).errors).toEqual([{ code: "INTERNAL", message: "boom" }]);
  });

  it("turns a process.exit deeper down into the command's failure code with what it printed", async () => {
    const result = await run(async () => {
      showError("Invalid path: ../x", undefined, ["Path must be within the project directory"]);
      process.exit(1);
    });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      data: null,
      errors: [
        {
          code: "TEST_FAILED",
          message: "Invalid path: ../x",
          suggestions: ["Path must be within the project directory"],
        },
      ],
    });
  });

  it("prints data with errors and exits with the code the action asks for", async () => {
    const result = await run(async () => ({
      data: { valid: false },
      errors: [{ code: "PROJECT_INCOMPLETE", message: "incomplete" }],
      exitCode: 1,
    }));
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      schemaVersion: 1,
      data: { valid: false },
      errors: [{ code: "PROJECT_INCOMPLETE", message: "incomplete" }],
    });
  });

  it("removes its exit handler once it has reported", async () => {
    const before = process.listenerCount("exit");
    await run(async () => ({ data: {} }));
    await run(async () => {
      throw new FliskError("x", ["y"]);
    });
    expect(process.listenerCount("exit")).toBe(before);
  });
});

describe("failureFromStderr", () => {
  it("reads the ❌ line as the message and the → lines as suggestions", () => {
    expect(
      failureFromStderr(
        "❌ Directory already exists: /x\n\n💡 Suggestions:\n   → Use --path\n",
        "fb",
      ),
    ).toEqual({ message: "Directory already exists: /x", suggestions: ["Use --path"] });
  });

  it("falls back to the printed lines, then to the fallback", () => {
    expect(failureFromStderr("FAIL  Bun is not installed\n→ Install Bun\n", "fb")).toEqual({
      message: "FAIL  Bun is not installed",
      suggestions: ["Install Bun"],
    });
    expect(failureFromStderr("", "flisk test exited with code 1")).toEqual({
      message: "flisk test exited with code 1",
    });
  });
});
