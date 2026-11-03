// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prompts = vi.hoisted(() => ({
  arrowText: vi.fn(),
  arrowSelect: vi.fn(),
  arrowMultiSelect: vi.fn(),
}));
vi.mock("../../utils/arrow-prompt.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/arrow-prompt.js")>()),
  ...prompts,
}));

import { freePort, runFlisk } from "../../test-support/index.js";
import { buildCreatePlan, CREATE_DEFAULTS } from "../../utils/create-plan.js";
import {
  assertFolderIsFree,
  collectAnswers,
  isInteractive,
  recoveryMessage,
  reviewLines,
  writeLocalFiles,
} from "../create.js";

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

describe("collectAnswers without a terminal", () => {
  it("never prompts and takes a local web app", async () => {
    const result = await collectAnswers(undefined, {}, false);
    expect(result).toEqual({
      name: "my-app",
      kind: "web",
      runtime: "local",
      frontend: "react",
      backend: "hono",
      extras: [],
    });
    for (const mock of Object.values(prompts)) expect(mock).not.toHaveBeenCalled();
  });

  it("a framework or extras flag picks the Docker route by itself", async () => {
    const result = await collectAnswers(
      "shop",
      { kind: "api", backend: "express", extras: "queue,worker" },
      false,
    );
    expect(result).toMatchObject({
      name: "shop",
      kind: "api",
      runtime: "docker",
      backend: "express",
      extras: ["queue", "worker"],
    });
  });

  it("--runtime local together with --extras is refused, with the way out", async () => {
    await expect(
      collectAnswers("shop", { runtime: "local", extras: "queue" }, false),
    ).rejects.toThrow(/need the Docker runtime/);
  });

  it("--extras none still means the Docker route when it is asked for", async () => {
    const result = await collectAnswers("shop", { runtime: "docker", extras: "none" }, false);
    expect(result).toMatchObject({ runtime: "docker", extras: [] });
  });

  it("rejects an unknown kind, runtime, framework or extra with the valid list", async () => {
    await expect(collectAnswers("shop", { kind: "nope" }, false)).rejects.toThrow(/web, api, saas/);
    await expect(collectAnswers("shop", { runtime: "vm" }, false)).rejects.toThrow(/local, docker/);
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

describe("collectAnswers with a terminal", () => {
  it("a local web app asks what you are building, how to run it, then the name: nothing else", async () => {
    prompts.arrowSelect.mockResolvedValueOnce("web").mockResolvedValueOnce("local");
    prompts.arrowText.mockResolvedValueOnce("storefront");
    const result = await collectAnswers(undefined, {}, true);
    expect(result).toMatchObject({ name: "storefront", kind: "web", runtime: "local" });
    expect(prompts.arrowSelect).toHaveBeenCalledTimes(2);
    expect(prompts.arrowSelect.mock.calls[0]?.[0].message).toBe("What do you want to build?");
    expect(prompts.arrowSelect.mock.calls[1]?.[0].message).toBe("How do you want to run it?");
    // No framework or extras menu, and no Postgres claim, on the local route.
    expect(prompts.arrowMultiSelect).not.toHaveBeenCalled();
  });

  it("the Docker route asks frameworks and extras, and the name comes last", async () => {
    prompts.arrowSelect
      .mockResolvedValueOnce("web")
      .mockResolvedValueOnce("docker")
      .mockResolvedValueOnce("vue")
      .mockResolvedValueOnce("fastify");
    prompts.arrowMultiSelect.mockResolvedValueOnce(["queue"]);
    prompts.arrowText.mockResolvedValueOnce("storefront");
    const result = await collectAnswers(undefined, {}, true);
    expect(result).toEqual({
      name: "storefront",
      kind: "web",
      runtime: "docker",
      frontend: "vue",
      backend: "fastify",
      extras: ["queue"],
    });
    const lastMenu = Math.max(
      ...prompts.arrowSelect.mock.invocationCallOrder,
      ...prompts.arrowMultiSelect.mock.invocationCallOrder,
    );
    expect(prompts.arrowText.mock.invocationCallOrder[0]).toBeGreaterThan(lastMenu);
    expect(prompts.arrowText.mock.calls[0]?.[0].initial).toBe("my-app");
  });

  it("a starter asks nothing about how it runs", async () => {
    prompts.arrowSelect.mockResolvedValueOnce("saas");
    prompts.arrowText.mockResolvedValueOnce("shop");
    const result = await collectAnswers(undefined, {}, true);
    expect(result.kind).toBe("saas");
    expect(prompts.arrowSelect).toHaveBeenCalledTimes(1);
    expect(prompts.arrowMultiSelect).not.toHaveBeenCalled();
  });

  it("More starters opens a second menu with the swarm and the storefront", async () => {
    prompts.arrowSelect.mockResolvedValueOnce("more").mockResolvedValueOnce("swarm");
    prompts.arrowText.mockResolvedValueOnce("bots");
    const result = await collectAnswers(undefined, {}, true);
    expect(result.kind).toBe("swarm");
    const second = prompts.arrowSelect.mock.calls[1]?.[0];
    expect(second.choices.map((c: { value: string }) => c.value)).toEqual(["swarm", "ecommerce"]);
  });

  it("the first menu is plain-language and every choice says what it is", async () => {
    prompts.arrowSelect.mockResolvedValueOnce("saas");
    prompts.arrowText.mockResolvedValueOnce("shop");
    await collectAnswers(undefined, {}, true);
    const choices = prompts.arrowSelect.mock.calls[0]?.[0].choices as {
      title: string;
      hint?: string;
    }[];
    expect(choices.map((c) => c.title)).toEqual([
      "Web app",
      "API or backend",
      "SaaS product",
      "AI application",
      "More starters…",
    ]);
    for (const choice of choices) expect(choice.hint, choice.title).toBeTruthy();
  });

  it("the local route is recommended and says it needs no Docker", async () => {
    prompts.arrowSelect.mockResolvedValueOnce("web").mockResolvedValueOnce("local");
    prompts.arrowText.mockResolvedValueOnce("shop");
    await collectAnswers(undefined, {}, true);
    const choices = prompts.arrowSelect.mock.calls[1]?.[0].choices as {
      title: string;
      value: string;
      hint?: string;
    }[];
    expect(choices[0]?.value).toBe("local");
    expect(choices[0]?.title).toMatch(/recommended/);
    expect(choices[0]?.hint).toMatch(/No Docker/);
  });

  it("does not ask for the name when it is given, and fails on a bad one before any question", async () => {
    prompts.arrowSelect.mockResolvedValueOnce("agent");
    await collectAnswers("bot", {}, true);
    expect(prompts.arrowText).not.toHaveBeenCalled();
    prompts.arrowSelect.mockReset();
    await expect(collectAnswers("My_App", {}, true)).rejects.toThrow(/not a usable project name/);
    expect(prompts.arrowSelect).not.toHaveBeenCalled();
  });
});

describe("the review, the files and the recovery message", () => {
  it("the review says what is created, what it needs, and what was chosen", () => {
    const answers = { name: "shop", ...CREATE_DEFAULTS };
    const lines = reviewLines(answers, buildCreatePlan(answers));
    expect(lines[0]).toBe("Creating shop: a Vite + React app with a small API");
    expect(lines[1]).toContain("Node.js and npm only");
    expect(lines[2]).toBe("Chosen: kind: web · runtime: local");
  });

  it("the Docker review names the Docker prerequisites", () => {
    const answers = { name: "shop", ...CREATE_DEFAULTS, runtime: "docker" as const };
    const lines = reviewLines(answers, buildCreatePlan(answers));
    expect(lines[1]).toContain("Docker, Tilt and Bun");
  });

  it("writeLocalFiles writes the templates with the project name filled in", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-create-write-"));
    try {
      const answers = { name: "shop", ...CREATE_DEFAULTS };
      const files = buildCreatePlan(answers)[0]?.files ?? [];
      const written = writeLocalFiles(dir, "shop", files);
      expect(written).toContain("vite.config.ts");
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      expect(pkg.name).toBe("shop");
      expect(pkg.scripts.dev).toBe("vite");
      expect(readFileSync(join(dir, "index.html"), "utf8")).toContain("<title>shop</title>");
      expect(readFileSync(join(dir, "src", "App.tsx"), "utf8")).not.toContain("__NAME__");
      expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain("node_modules");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("after a failure it says what finished, what did not run, and how to start over", () => {
    const steps = buildCreatePlan({ name: "shop", ...CREATE_DEFAULTS, runtime: "docker" });
    const lines = recoveryMessage("/work/shop", steps, 1);
    expect(lines[0]).toContain("/work/shop is incomplete");
    expect(lines[0]).toContain(steps[1]?.label);
    expect(lines).toContain(`  done: ${steps[0]?.label}`);
    expect(lines).toContain(`  not run: ${steps[2]?.label}`);
    expect(lines.at(-1)).toContain("rm -rf /work/shop");
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

  it("--dry-run prints what would happen and writes nothing", () => {
    const run = runFlisk(["create", "shop", "--dry-run"], { cwd: dir, timeout: 60_000 });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("runtime: local");
    expect(run.stdout).toContain("needs: Node.js and npm only");
    expect(run.stdout).toContain("write package.json");
    expect(run.stdout).toContain("Dry run: nothing was written");
    expect(existsSync(join(dir, "shop"))).toBe(false);
  });

  it("--dry-run on the Docker route lists the flisk commands", () => {
    const run = runFlisk(
      ["create", "shop", "--runtime", "docker", "--extras", "queue", "--dry-run"],
      { cwd: dir, timeout: 60_000 },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("flisk resource shop-api --type backend --framework hono");
    expect(run.stdout).toContain("flisk resource shop-queue --type queue --framework nats");
    expect(existsSync(join(dir, "shop"))).toBe(false);
  });

  it("creates a local app with no Docker artifacts and tells you to run npm", () => {
    const run = runFlisk(["create", "shop", "--yes"], { cwd: dir, timeout: 60_000 });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const project = join(dir, "shop");
    for (const file of [
      "package.json",
      "vite.config.ts",
      "index.html",
      "src/App.tsx",
      "service.json",
    ]) {
      expect(existsSync(join(project, file)), file).toBe(true);
    }
    for (const file of ["Dockerfile", "docker-compose.yml", "Tiltfile", ".autogenerated"]) {
      expect(existsSync(join(project, file)), file).toBe(false);
    }
    const manifest = JSON.parse(readFileSync(join(project, "service.json"), "utf8"));
    expect(manifest.command).toBe("npm run dev");
    expect(run.stdout).toContain("npm install");
    expect(run.stdout).toContain("npm run dev");
    expect(run.stdout).not.toMatch(/flisk up/);
    expect(run.stdout).toContain("Needs: Node.js and npm only");
  });

  it("the Docker route still writes the container-based project, and it verifies", () => {
    const run = runFlisk(
      ["create", "shop", "--kind", "api", "--backend", "fastify", "--extras", "queue,worker"],
      { cwd: dir, timeout: 180_000 },
    );
    expect(run.status, run.stdout + run.stderr).toBe(0);
    for (const part of ["api", "queue", "worker"]) {
      const file = join(dir, "shop", "services", "app", `shop-${part}`, "service.json");
      expect(existsSync(file), file).toBe(true);
    }
    expect(existsSync(join(dir, "shop", ".flisk", "project.json"))).toBe(true);
    const verify = runFlisk(["config", "verify"], { cwd: join(dir, "shop"), timeout: 120_000 });
    expect(verify.status, verify.stdout + verify.stderr).toBe(0);
    expect(run.stdout).toContain("flisk up app");
    expect(run.stdout).toContain("Needs: Docker, Tilt and Bun");
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

/** The first of npm and bun that runs, to install the generated app's dependencies. */
function packageManager(): string | undefined {
  for (const candidate of ["npm", "bun"]) {
    if (spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0) return candidate;
  }
  return undefined;
}

describe("the default app runs without Docker or Tilt", () => {
  const pm = packageManager();
  let dir: string;
  let server: ChildProcess | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flisk-create-run-"));
  });
  afterEach(() => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(!pm)(
    "creates, installs and serves a page and its API while docker and tilt are broken",
    async () => {
      // docker and tilt shims that leave a marker and fail: any use of either shows up below.
      const shims = join(dir, "shims");
      mkdirSync(shims);
      const marker = join(dir, "container-tool-was-called");
      for (const tool of ["docker", "tilt"]) {
        const file = join(shims, tool);
        writeFileSync(file, `#!/bin/sh\necho ${tool} >> "${marker}"\nexit 127\n`);
        chmodSync(file, 0o755);
      }
      const PATH = `${shims}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`;

      const created = runFlisk(["create", "my-app", "--yes"], {
        cwd: dir,
        timeout: 60_000,
        env: { PATH },
      });
      expect(created.status, created.stdout + created.stderr).toBe(0);
      const project = join(dir, "my-app");

      const install = spawnSync(pm as string, ["install"], {
        cwd: project,
        env: { ...process.env, PATH },
        encoding: "utf8",
        timeout: 240_000,
      });
      expect(install.status, install.stdout + install.stderr).toBe(0);

      const port = await freePort();
      server = spawn(pm as string, ["run", "dev"], {
        cwd: project,
        env: { ...process.env, PATH, PORT: String(port) },
        detached: true,
        stdio: "ignore",
      });

      const base = `http://localhost:${port}`;
      let page: Response | undefined;
      for (let attempt = 0; attempt < 60 && !page?.ok; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        page = await fetch(`${base}/`).catch(() => undefined);
      }
      expect(page?.status, "the page never answered").toBe(200);
      expect(await page?.text()).toContain('id="root"');
      const api = await fetch(`${base}/api/hello`);
      expect(await api.json()).toEqual({ message: "Hello from your API" });

      expect(existsSync(marker), "docker or tilt was called").toBe(false);
    },
    360_000,
  );
});
