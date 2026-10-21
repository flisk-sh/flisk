// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
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

/** The choices the backend picker shows: every registered framework, the default first. */
const BACKEND_FRAMEWORK_CHOICES = [
  { title: "Bun + Hono", value: "hono" },
  { title: "Bun + Express", value: "express" },
  { title: "Bun + Elysia", value: "elysia" },
  { title: "Bun + Fastify", value: "fastify" },
  { title: "Bun + h3", value: "h3" },
  { title: "Bun + Koa", value: "koa" },
  { title: "Bun + NestJS", value: "nestjs" },
];

interface RunOptions {
  /** Whether stdin looks like a terminal. A script or a pipe is not one. */
  isTTY?: boolean;
}

/**
 * Runs `flisk resource` in process with the prompts stubbed, so the interactive path is reachable
 * without a terminal. The command is imported per run, because Commander keeps option values
 * between parses of the same command instance.
 */
async function runResource(args: string[], options: RunOptions = {}) {
  vi.resetModules();
  const { resourceCommand } = await import("../resource.js");
  const { clearDiscoveryCache } = await import("../../utils/discovery-context.js");
  const projectRoot = createTempProject();
  clearDiscoveryCache();

  const isTTY = options.isTTY ?? true;
  const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
  try {
    const result = await runCommandInProcess(resourceCommand, args, projectRoot);
    return { ...result, projectRoot };
  } finally {
    if (original) {
      Object.defineProperty(process.stdin, "isTTY", original);
    } else {
      Object.defineProperty(process.stdin, "isTTY", { value: undefined, configurable: true });
    }
  }
}

/** The calls the backend framework picker received. The frontend picker uses another message. */
function backendFrameworkPromptCalls() {
  return promptMocks.promptSelect.mock.calls.filter(
    ([promptOptions]) => promptOptions.message === "Backend framework:",
  );
}

function readJson(projectRoot: string, relativePath: string) {
  return JSON.parse(readFileSync(join(projectRoot, relativePath), "utf-8"));
}

describe("interactive backend framework choice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // The picker answers "Express"; the stack is always named on the command line.
    promptMocks.promptSelect.mockResolvedValue("express");
    promptMocks.promptText.mockResolvedValue("main");
    promptMocks.promptConfirm.mockResolvedValue(true);
  });

  it("asks which backend framework to use and scaffolds the chosen one", async () => {
    const result = await runResource(["api", "--type", "backend", "--stack", "shop"]);

    expect(result.status).toBeUndefined();
    expect(backendFrameworkPromptCalls()).toHaveLength(1);
    expect(backendFrameworkPromptCalls()[0][0]).toEqual({
      message: "Backend framework:",
      choices: BACKEND_FRAMEWORK_CHOICES,
    });

    const service = readJson(result.projectRoot, "services/shop/api/service.json");
    expect(service.framework).toBe("express");
    const pkg = readJson(result.projectRoot, "services/shop/api/package.json");
    expect(pkg.dependencies).toHaveProperty("express");
    expect(pkg.dependencies).not.toHaveProperty("hono");
    expect(
      readFileSync(join(result.projectRoot, "services/shop/api/src/index.ts"), "utf-8"),
    ).toContain("from 'express'");
  });

  it("offers the default framework first, so the default is the one a user picks with 1", async () => {
    await runResource(["api", "--type", "backend", "--stack", "shop"]);

    const choices = backendFrameworkPromptCalls()[0][0].choices;
    expect(choices[0]).toEqual({ title: "Bun + Hono", value: "hono" });
    expect(choices.map((choice: { value: string }) => choice.value)).toContain("hono");
  });

  it("keeps the historical Hono default with --yes instead of prompting", async () => {
    const result = await runResource(["api", "--type", "backend", "--stack", "shop", "--yes"]);

    expect(result.status).toBeUndefined();
    expect(promptMocks.promptSelect).not.toHaveBeenCalled();
    // The default scaffold is a Hono service without an explicit framework field, exactly as before.
    const service = readJson(result.projectRoot, "services/shop/api/service.json");
    expect(service).not.toHaveProperty("framework");
    expect(
      readJson(result.projectRoot, "services/shop/api/package.json").dependencies,
    ).toHaveProperty("hono");
    expect(
      readFileSync(join(result.projectRoot, "services/shop/api/src/index.ts"), "utf-8"),
    ).toContain("new Hono()");
  });

  it("keeps the historical Hono default when stdin is not a terminal", async () => {
    const result = await runResource(["api", "--type", "backend", "--stack", "shop"], {
      isTTY: false,
    });

    expect(result.status).toBeUndefined();
    expect(promptMocks.promptSelect).not.toHaveBeenCalled();
    const service = readJson(result.projectRoot, "services/shop/api/service.json");
    expect(service).not.toHaveProperty("framework");
    expect(
      readJson(result.projectRoot, "services/shop/api/package.json").dependencies,
    ).toHaveProperty("hono");
  });

  it("uses an explicit --framework without prompting", async () => {
    const result = await runResource([
      "api",
      "--type",
      "backend",
      "--framework",
      "fastify",
      "--stack",
      "shop",
    ]);

    expect(result.status).toBeUndefined();
    expect(promptMocks.promptSelect).not.toHaveBeenCalled();
    expect(readJson(result.projectRoot, "services/shop/api/service.json").framework).toBe(
      "fastify",
    );
    expect(
      readJson(result.projectRoot, "services/shop/api/package.json").dependencies,
    ).toHaveProperty("fastify");
  });

  it("does not prompt for a language that owns its runtime", async () => {
    const result = await runResource([
      "api",
      "--type",
      "backend",
      "--language",
      "python",
      "--stack",
      "shop",
    ]);

    expect(result.status).toBeUndefined();
    expect(promptMocks.promptSelect).not.toHaveBeenCalled();
    const service = readJson(result.projectRoot, "services/shop/api/service.json");
    expect(service.language).toBe("python");
    expect(service).not.toHaveProperty("framework");
    expect(existsSync(join(result.projectRoot, "services/shop/api/pyproject.toml"))).toBe(true);
  });

  it("does not prompt for the other resource types", async () => {
    for (const type of ["worker", "mcp", "agent"]) {
      const result = await runResource(["svc", "--type", type, "--stack", "shop"]);
      expect(result.status, `${type}: ${result.stderr}`).toBeUndefined();
      expect(backendFrameworkPromptCalls(), type).toHaveLength(0);
    }
  });

  it("keeps the frontend picker on a frontend resource", async () => {
    promptMocks.promptSelect.mockResolvedValue("react");
    const result = await runResource(["web", "--type", "frontend", "--stack", "shop"]);

    expect(result.status, result.stderr).toBeUndefined();
    expect(backendFrameworkPromptCalls()).toHaveLength(0);
    expect(promptMocks.promptSelect).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Frontend framework:" }),
    );
  });

  it("keeps the validation messages for an unsupported combination", async () => {
    const python = await runResource([
      "api",
      "--type",
      "backend",
      "--language",
      "python",
      "--framework",
      "express",
      "--stack",
      "shop",
    ]);
    expect(python.status).toBe(1);
    expect(python.stderr).toContain("cannot be combined with --language python");
    expect(existsSync(join(python.projectRoot, "services/shop/api"))).toBe(false);

    const worker = await runResource([
      "job",
      "--type",
      "worker",
      "--framework",
      "express",
      "--stack",
      "shop",
    ]);
    expect(worker.status).toBe(1);
    expect(worker.stderr).toContain("only be used with --type frontend or --type backend");

    const unknown = await runResource([
      "api",
      "--type",
      "backend",
      "--framework",
      "sinatra",
      "--stack",
      "shop",
    ]);
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('Unknown backend framework "sinatra"');
    expect(existsSync(join(unknown.projectRoot, "services/shop/api"))).toBe(false);
  });
});
