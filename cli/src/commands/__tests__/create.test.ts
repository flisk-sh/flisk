// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prompts = vi.hoisted(() => ({
  promptText: vi.fn(),
  promptSelect: vi.fn(),
  promptMultiSelect: vi.fn(),
  promptConfirm: vi.fn(),
}));
vi.mock("../../utils/prompt.js", () => prompts);

import { runFlisk } from "../../test-support/index.js";
import { assertFolderIsFree, collectAnswers, isInteractive } from "../create.js";

beforeEach(() => {
  for (const mock of Object.values(prompts)) mock.mockReset();
});

describe("isInteractive", () => {
  it("needs a terminal on both ends", () => {
    expect(isInteractive({}, { in: true, out: true })).toBe(true);
    expect(isInteractive({}, { in: false, out: true })).toBe(false);
    expect(isInteractive({}, { in: true, out: false })).toBe(false);
  });
  it("--yes turns questions off even on a terminal", () => {
    expect(isInteractive({ yes: true }, { in: true, out: true })).toBe(false);
  });
});

describe("collectAnswers", () => {
  it("never prompts without a terminal and fills the defaults", async () => {
    const result = await collectAnswers(undefined, {}, false);
    expect(result).toEqual({
      name: "my-app",
      kind: "web",
      frontend: "react",
      backend: "hono",
      extras: [],
    });
    for (const mock of Object.values(prompts)) expect(mock).not.toHaveBeenCalled();
  });

  it("flags win over defaults and over questions", async () => {
    const result = await collectAnswers(
      "shop",
      { kind: "api", backend: "express", extras: "queue,worker" },
      true,
    );
    expect(result).toMatchObject({
      name: "shop",
      kind: "api",
      backend: "express",
      extras: ["queue", "worker"],
    });
    expect(prompts.promptSelect).not.toHaveBeenCalled();
    expect(prompts.promptMultiSelect).not.toHaveBeenCalled();
  });

  it("asks the website, API and extras questions for a web app", async () => {
    prompts.promptText.mockResolvedValueOnce("storefront");
    prompts.promptSelect
      .mockResolvedValueOnce("web")
      .mockResolvedValueOnce("vue")
      .mockResolvedValueOnce("fastify");
    prompts.promptMultiSelect.mockResolvedValueOnce(["queue"]);
    const result = await collectAnswers(undefined, {}, true);
    expect(result).toEqual({
      name: "storefront",
      kind: "web",
      frontend: "vue",
      backend: "fastify",
      extras: ["queue"],
    });
    expect(prompts.promptSelect).toHaveBeenCalledTimes(3);
  });

  it("asks nothing more once a starter kind is picked", async () => {
    prompts.promptSelect.mockResolvedValueOnce("agent");
    const result = await collectAnswers("bot", {}, true);
    expect(result.kind).toBe("agent");
    expect(prompts.promptSelect).toHaveBeenCalledTimes(1);
    expect(prompts.promptMultiSelect).not.toHaveBeenCalled();
  });

  it("--extras none means no extras and no question", async () => {
    const result = await collectAnswers("shop", { kind: "web", extras: "none" }, true);
    expect(result.extras).toEqual([]);
    expect(prompts.promptMultiSelect).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind, framework or extra with the valid list", async () => {
    await expect(collectAnswers("shop", { kind: "nope" }, false)).rejects.toThrow(/web, api, saas/);
    await expect(collectAnswers("shop", { backend: "rails" }, false)).rejects.toThrow(
      /hono, express/,
    );
    await expect(collectAnswers("shop", { extras: "kafka" }, false)).rejects.toThrow(
      /Unknown extra/,
    );
  });

  it("rejects a name that is not a safe folder name", async () => {
    await expect(collectAnswers("../evil", {}, false)).rejects.toThrow(/not a usable project name/);
    await expect(collectAnswers("My_App", {}, false)).rejects.toThrow(/not a usable project name/);
  });
});

describe("assertFolderIsFree", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flisk-create-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("accepts a folder that does not exist or is empty", () => {
    expect(() => assertFolderIsFree(join(dir, "new"))).not.toThrow();
    mkdirSync(join(dir, "empty"));
    expect(() => assertFolderIsFree(join(dir, "empty"))).not.toThrow();
  });

  it("refuses a folder that already has files, so nothing is overwritten", () => {
    mkdirSync(join(dir, "full"));
    writeFileSync(join(dir, "full", "keep.txt"), "mine");
    expect(() => assertFolderIsFree(join(dir, "full"))).toThrow(/already exists and is not empty/);
  });
});

describe("flisk create (the real CLI, no terminal)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flisk-create-cli-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("--dry-run prints the commands and writes nothing", () => {
    const run = runFlisk(["create", "shop", "--kind", "web", "--extras", "queue", "--dry-run"], {
      cwd: dir,
      timeout: 60_000,
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("flisk project --yes");
    expect(run.stdout).toContain("flisk resource shop-api --type backend --framework hono");
    expect(run.stdout).toContain("flisk resource shop-queue --type queue --framework nats");
    expect(existsSync(join(dir, "shop"))).toBe(false);
  });

  it("takes the defaults without a terminal instead of waiting for answers", () => {
    const run = runFlisk(["create", "--dry-run"], { cwd: dir, timeout: 60_000 });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("name: my-app");
    expect(run.stdout).toContain("flisk resource my-app-web --type frontend --framework react");
  });

  it("creates a project whose files verify, with one service.json per part", () => {
    const run = runFlisk(
      ["create", "shop", "--kind", "api", "--backend", "fastify", "--extras", "queue,worker"],
      { cwd: dir, timeout: 180_000 },
    );
    expect(run.status, run.stdout + run.stderr).toBe(0);
    for (const part of ["api", "queue", "worker"]) {
      const file = join(dir, "shop", "services", "app", `shop-${part}`, "service.json");
      expect(existsSync(file), file).toBe(true);
    }
    expect(
      JSON.parse(readFileSync(join(dir, "shop", ".flisk", "project.json"), "utf8")),
    ).toBeTruthy();
    const verify = runFlisk(["config", "verify"], { cwd: join(dir, "shop"), timeout: 120_000 });
    expect(verify.status, verify.stdout + verify.stderr).toBe(0);
    expect(run.stdout).toContain("flisk up app");
  }, 240_000);

  it("refuses a folder that already has files and leaves them alone", () => {
    mkdirSync(join(dir, "shop"));
    writeFileSync(join(dir, "shop", "keep.txt"), "mine");
    const run = runFlisk(["create", "shop", "--yes"], { cwd: dir, timeout: 60_000 });
    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain("already exists and is not empty");
    expect(readFileSync(join(dir, "shop", "keep.txt"), "utf8")).toBe("mine");
  });

  it("names the valid choices for a wrong --kind and exits non-zero", () => {
    const run = runFlisk(["create", "shop", "--kind", "nope", "--dry-run"], {
      cwd: dir,
      timeout: 60_000,
    });
    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain("web, api, saas, agent, swarm, ecommerce");
  });
});
