// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommandInProcess } from "../../test-support/run-in-process.js";
import { createTempProject } from "../../test-support/temp-project.js";

const promptMocks = vi.hoisted(() => ({
  promptSelect: vi.fn(),
  promptText: vi.fn(),
  promptConfirm: vi.fn(),
  promptMultiSelect: vi.fn(),
}));

vi.mock("../../utils/prompt.js", () => promptMocks);

interface RunOptions {
  /** Whether stdin / stdout look like a terminal. A script or a pipe is not one. */
  stdinTTY?: boolean;
  stdoutTTY?: boolean;
}

function setTTY(stream: NodeJS.WriteStream | NodeJS.ReadStream, value: boolean | undefined) {
  const original = Object.getOwnPropertyDescriptor(stream, "isTTY");
  Object.defineProperty(stream, "isTTY", { value, configurable: true });
  return () => {
    if (original) Object.defineProperty(stream, "isTTY", original);
    else Object.defineProperty(stream, "isTTY", { value: undefined, configurable: true });
  };
}

/** Runs `flisk resource` in process with the prompts stubbed and the terminal state chosen by the test. */
async function runResource(args: string[], options: RunOptions = {}) {
  vi.resetModules();
  const { resourceCommand } = await import("../resource.js");
  const { clearDiscoveryCache } = await import("../../utils/discovery-context.js");
  const projectRoot = createTempProject();
  clearDiscoveryCache();
  const restoreIn = setTTY(process.stdin, options.stdinTTY ?? true);
  const restoreOut = setTTY(process.stdout, options.stdoutTTY ?? true);
  try {
    const result = await runCommandInProcess(resourceCommand, args, projectRoot);
    return { ...result, projectRoot };
  } finally {
    restoreIn();
    restoreOut();
  }
}

function frameworkPromptCalls() {
  return promptMocks.promptSelect.mock.calls.filter(([o]) =>
    /^(Database|Queue) framework:$/.test(o.message),
  );
}

function readService(projectRoot: string, name: string) {
  return JSON.parse(readFileSync(join(projectRoot, "services/hqc", name, "service.json"), "utf-8"));
}

describe("interactive database and queue framework choice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    promptMocks.promptText.mockResolvedValue("main");
    promptMocks.promptConfirm.mockResolvedValue(true);
  });

  it("asks which database to run, the shared Postgres first, and scaffolds the chosen one", async () => {
    promptMocks.promptSelect.mockResolvedValue("redis");

    const result = await runResource(["cache", "--type", "database", "--stack", "hqc"]);

    expect(result.status).toBeUndefined();
    expect(frameworkPromptCalls()).toHaveLength(1);
    const { message, choices } = frameworkPromptCalls()[0][0];
    expect(message).toBe("Database framework:");
    expect(choices.map((c: { value: string }) => c.value)).toEqual([
      "postgres",
      "redis",
      "qdrant",
      "minio",
      "mlflow",
      "mysql",
      "mongodb",
      "clickhouse",
    ]);
    expect(readService(result.projectRoot, "cache")).toMatchObject({
      appType: "bring-your-own",
      framework: "redis",
    });
  });

  it("asks which queue to run and scaffolds the chosen one", async () => {
    promptMocks.promptSelect.mockResolvedValue("rabbitmq");

    const result = await runResource(["bus", "--type", "queue", "--stack", "hqc"]);

    expect(result.status).toBeUndefined();
    expect(frameworkPromptCalls()[0][0].message).toBe("Queue framework:");
    expect(frameworkPromptCalls()[0][0].choices.map((c: { value: string }) => c.value)).toEqual([
      "nats",
      "rabbitmq",
    ]);
    expect(readService(result.projectRoot, "bus")).toMatchObject({ framework: "rabbitmq" });
  });

  it("picking postgres keeps the shared Postgres resource", async () => {
    promptMocks.promptSelect.mockResolvedValue("postgres");

    const result = await runResource(["db", "--type", "database", "--stack", "hqc"]);

    expect(readService(result.projectRoot, "db")).toMatchObject({
      appType: "database",
      framework: "postgres",
    });
  });

  it.each([
    ["--yes", ["--yes"], "database", { appType: "database", framework: "postgres" }],
    ["--json", ["--json"], "database", { appType: "database", framework: "postgres" }],
    ["--yes on a queue", ["--yes"], "queue", { appType: "bring-your-own", framework: "nats" }],
  ])("%s takes the default without asking", async (_label, flags, type, expected) => {
    const result = await runResource(["res", "--type", type, "--stack", "hqc", ...flags]);

    expect(result.status).toBeUndefined();
    expect(promptMocks.promptSelect).not.toHaveBeenCalled();
    expect(readService(result.projectRoot, "res")).toMatchObject(expected);
  });

  it("does not ask when --framework is given", async () => {
    const result = await runResource([
      "store",
      "--type",
      "database",
      "--framework",
      "minio",
      "--stack",
      "hqc",
    ]);

    expect(frameworkPromptCalls()).toHaveLength(0);
    expect(readService(result.projectRoot, "store")).toMatchObject({ framework: "minio" });
  });

  it.each([
    ["stdin is not a terminal", { stdinTTY: false }],
    ["stdout is piped", { stdoutTTY: false }],
  ])("does not ask when %s", async (_label, tty) => {
    const result = await runResource(["db", "--type", "database", "--stack", "hqc"], tty);

    expect(frameworkPromptCalls()).toHaveLength(0);
    expect(readService(result.projectRoot, "db")).toMatchObject({ framework: "postgres" });
  });
});
