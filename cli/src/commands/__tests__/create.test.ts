// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
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

import { BACKEND_LANGUAGES } from "../../backend-languages/registry.js";
import { freePort, runFlisk } from "../../test-support/index.js";
import {
  backendCatalog,
  extraCatalog,
  frontendCatalog,
  starterCatalog,
} from "../../utils/create-catalog.js";
import {
  asksToStart,
  buildCreatePlan,
  isEmptyApp,
  isValidProjectName,
  toProjectName,
} from "../../utils/create-plan.js";
import {
  assertFolderIsFree,
  claimFolder,
  collectAnswers,
  firstPort,
  generatedServices,
  isInteractive,
  localInstallHint,
  nextSteps,
  recoveryMessage,
  reviewLines,
  splitCommand,
  startBlockers,
  whereToOpen,
} from "../create.js";

const frontends = frontendCatalog();
const backends = backendCatalog();
const defaultLanguage = backends[0];
const defaultFramework = defaultLanguage?.frameworks[0]?.id;

beforeEach(() => {
  for (const mock of Object.values(prompts)) mock.mockReset();
});

describe("isInteractive", () => {
  it("needs a terminal on both ends, and --yes turns questions off", () => {
    expect(isInteractive({}, { in: true, out: true })).toBe(true);
    expect(isInteractive({}, { in: false, out: true })).toBe(false);
    expect(isInteractive({ yes: true }, { in: true, out: true })).toBe(false);
  });
});

describe("collectAnswers without a terminal", () => {
  it("never prompts, and takes the registries' defaults: a website and an API, on your computer", async () => {
    const result = await collectAnswers(undefined, {}, false);
    expect(result).toEqual({
      name: "my-app",
      runtime: "local",
      frontend: frontends[0]?.id,
      backend: { language: defaultLanguage?.id, framework: defaultFramework },
      extras: [],
    });
    for (const mock of Object.values(prompts)) expect(mock).not.toHaveBeenCalled();
  });

  it("--frontend none and --backend none leave nothing to build, and say so", async () => {
    await expect(
      collectAnswers("shop", { frontend: "none", backend: "none" }, false),
    ).rejects.toThrow(/nothing to create/);
  });

  it("a website alone, or an API alone", async () => {
    const web = await collectAnswers("shop", { backend: "none" }, false);
    expect(web.backend).toBeUndefined();
    expect(web.frontend).toBe(frontends[0]?.id);
    const api = await collectAnswers("shop", { frontend: "none" }, false);
    expect(api.frontend).toBeUndefined();
    expect(api.backend?.language).toBe(defaultLanguage?.id);
  });

  it("a framework names its language, and a language alone takes no framework", async () => {
    const withFramework = await collectAnswers("shop", { backend: defaultFramework }, false);
    expect(withFramework.backend).toEqual({
      language: defaultLanguage?.id,
      framework: defaultFramework,
    });
    const other = backends[1];
    const withLanguage = await collectAnswers("shop", { language: other?.id }, false);
    expect(withLanguage.backend).toEqual({ language: other?.id });
  });

  it("rejects a framework combined with a language it does not run on", async () => {
    await expect(
      collectAnswers("shop", { backend: defaultFramework, language: backends[1]?.id }, false),
    ).rejects.toThrow(/runs on/);
  });

  it("an extra implies Docker, and an extra with --runtime local is refused", async () => {
    const result = await collectAnswers("shop", { extras: "worker" }, false);
    expect(result).toMatchObject({ runtime: "docker", extras: ["worker"] });
    await expect(
      collectAnswers("shop", { runtime: "local", extras: "worker" }, false),
    ).rejects.toThrow(/need the Docker runtime/);
  });

  it("a starter takes its own runtime: local only when the CLI writes it itself", async () => {
    const local = starterCatalog().find((s) => s.local);
    const docker = starterCatalog().find((s) => !s.local);
    expect((await collectAnswers("shop", { starter: local?.id }, false)).runtime).toBe("local");
    expect((await collectAnswers("shop", { starter: docker?.id }, false)).runtime).toBe("docker");
  });

  it("names every valid id when a flag is wrong", async () => {
    await expect(collectAnswers("shop", { frontend: "nope" }, false)).rejects.toThrow(
      new RegExp(frontends.map((f) => f.id).join(", ")),
    );
    await expect(collectAnswers("shop", { language: "nope" }, false)).rejects.toThrow(
      new RegExp(backends.map((b) => b.id).join(", ")),
    );
    await expect(collectAnswers("shop", { starter: "nope" }, false)).rejects.toThrow(
      /Unknown --starter/,
    );
    await expect(collectAnswers("shop", { runtime: "vm" }, false)).rejects.toThrow(/local, docker/);
  });

  it("rejects a name that is not a safe folder name before anything else", async () => {
    await expect(
      collectAnswers("shop", { backend: "none", language: backends[0]?.id }, false),
    ).rejects.toThrow(/--backend none leaves the API out/);
    await expect(collectAnswers("../evil", {}, false)).rejects.toThrow(/not a usable project name/);
  });
});

describe("collectAnswers with a terminal", () => {
  it("asks what to build, the website, the API stack, extras, then the name — never how to run it", async () => {
    prompts.arrowSelect
      .mockResolvedValueOnce("custom")
      .mockResolvedValueOnce(frontends[1]?.id)
      .mockResolvedValueOnce(`${defaultLanguage?.id}/${defaultFramework}`);
    prompts.arrowMultiSelect.mockResolvedValueOnce([]);
    prompts.arrowText.mockResolvedValueOnce("storefront");
    const result = await collectAnswers(undefined, {}, true);
    expect(result).toMatchObject({
      name: "storefront",
      runtime: "local",
      frontend: frontends[1]?.id,
      backend: { language: defaultLanguage?.id, framework: defaultFramework },
    });
    const messages = prompts.arrowSelect.mock.calls.map((call) => call[0].message);
    expect(messages[0]).toBe("What do you want to make?");
    expect(messages).toHaveLength(3);
    // Extras and the name come after every menu, and Enter takes their defaults.
    expect(prompts.arrowMultiSelect.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...prompts.arrowSelect.mock.invocationCallOrder),
    );
    expect(prompts.arrowText.mock.invocationCallOrder[0]).toBeGreaterThan(
      prompts.arrowMultiSelect.mock.invocationCallOrder[0],
    );
    expect(prompts.arrowText.mock.calls[0]?.[0].initial).toBe("my-app");
  });

  it("every long menu can be filtered by typing", async () => {
    prompts.arrowSelect
      .mockResolvedValueOnce("custom")
      .mockResolvedValueOnce(frontends[0]?.id)
      .mockResolvedValueOnce(`${defaultLanguage?.id}/${defaultFramework}`);
    prompts.arrowMultiSelect.mockResolvedValueOnce([]);
    prompts.arrowText.mockResolvedValueOnce("shop");
    await collectAnswers(undefined, {}, true);
    const calls = prompts.arrowSelect.mock.calls.map((call) => call[0]);
    for (const menu of calls.slice(1)) expect(menu.filterable, menu.message).toBe(true);
  });

  it("the website menu is the registry's rows, the default first and marked", async () => {
    prompts.arrowSelect
      .mockResolvedValueOnce("custom")
      .mockResolvedValueOnce(frontends[0]?.id)
      .mockResolvedValueOnce(`${defaultLanguage?.id}/${defaultFramework}`);
    prompts.arrowMultiSelect.mockResolvedValueOnce([]);
    prompts.arrowText.mockResolvedValueOnce("shop");
    await collectAnswers(undefined, {}, true);
    const menu = prompts.arrowSelect.mock.calls[1]?.[0];
    const offered = menu.choices.map((c: { value: string }) => c.value);
    expect(offered).toEqual(frontends.map((f) => f.id));
    expect(menu.choices[0].title).toMatch(/default/);
  });

  it("the API stack menu is one flat list of language + framework rows, default first", async () => {
    prompts.arrowSelect
      .mockResolvedValueOnce("custom")
      .mockResolvedValueOnce(frontends[0]?.id)
      .mockResolvedValueOnce(`${defaultLanguage?.id}/${defaultFramework}`);
    prompts.arrowMultiSelect.mockResolvedValueOnce([]);
    prompts.arrowText.mockResolvedValueOnce("shop");
    const result = await collectAnswers(undefined, {}, true);
    expect(result.backend).toEqual({
      language: defaultLanguage?.id,
      framework: defaultFramework,
    });
    const rows = prompts.arrowSelect.mock.calls[2]?.[0].choices as {
      title: string;
      value: string;
      hint: string;
    }[];
    // One row per combination; the first row is the registry's default stack.
    const expected = backends.flatMap((language) =>
      language.frameworks.length === 0
        ? [`${language.id}`]
        : language.frameworks.map((framework) => `${language.id}/${framework.id}`),
    );
    expect(rows.map((row) => row.value)).toEqual(expected);
    // The default row keeps the language's label; the other frameworks keep their own ("Bun + Express").
    expect(rows[0]?.title).toMatch(/default/);
    expect(rows[0]?.title).toContain(`${defaultLanguage?.title}`);
    const second = backends[0]?.frameworks[1];
    const secondRow = rows.find((row) => row.value === `${defaultLanguage?.id}/${second?.id}`);
    expect(secondRow?.title).toBe(`${second?.title}`);
    // A language that owns its runtime is a single row without a slash.
    expect(rows.some((row) => !row.value.includes("/"))).toBe(true);
  });

  it("a language that owns its runtime asks no framework question and takes the bare row", async () => {
    const owner = backends.find((b) => b.frameworks.length === 0);
    prompts.arrowSelect
      .mockResolvedValueOnce("custom")
      .mockResolvedValueOnce(frontends[0]?.id)
      .mockResolvedValueOnce(owner?.id);
    prompts.arrowMultiSelect.mockResolvedValueOnce([]);
    prompts.arrowText.mockResolvedValueOnce("shop");
    const result = await collectAnswers(undefined, {}, true);
    expect(result.backend).toEqual({ language: owner?.id });
    expect(prompts.arrowSelect).toHaveBeenCalledTimes(3); // the shape, the website and the stack, nothing between
    prompts.arrowSelect.mockReset();
    prompts.arrowMultiSelect.mockReset();
    prompts.arrowSelect
      .mockResolvedValueOnce("custom")
      .mockResolvedValueOnce(frontends[0]?.id)
      .mockResolvedValueOnce(owner?.id ?? "");
    prompts.arrowMultiSelect.mockResolvedValueOnce([]);
    const bare = await collectAnswers(undefined, {}, true);
    expect(bare.backend).toEqual({ language: owner?.id });
  });

  it("extras decide the runtime: an empty answer stays on this computer, a pick becomes a Docker project", async () => {
    prompts.arrowSelect
      .mockResolvedValueOnce("custom")
      .mockResolvedValueOnce(frontends[0]?.id)
      .mockResolvedValueOnce(`${defaultLanguage?.id}/${defaultFramework}`);
    prompts.arrowMultiSelect.mockResolvedValueOnce([]);
    prompts.arrowText.mockResolvedValueOnce("shop");
    expect((await collectAnswers(undefined, {}, true)).runtime).toBe("local");
    prompts.arrowSelect.mockReset();
    prompts.arrowMultiSelect.mockReset();
    prompts.arrowSelect
      .mockResolvedValueOnce("custom")
      .mockResolvedValueOnce(frontends[0]?.id)
      .mockResolvedValueOnce(`${defaultLanguage?.id}/${defaultFramework}`);
    const firstExtra = extraCatalog()[0]?.id;
    prompts.arrowMultiSelect.mockResolvedValueOnce([firstExtra ?? ""]);
    prompts.arrowText.mockResolvedValueOnce("shop");
    const withExtra = await collectAnswers(undefined, {}, true);
    expect(withExtra.runtime).toBe("docker");
    expect(withExtra.extras).toEqual([firstExtra]);
  });

  it("the plain journey is one question and a name: no framework, language or extras menu", async () => {
    prompts.arrowSelect.mockResolvedValueOnce("both");
    prompts.arrowText.mockResolvedValueOnce("my-app");
    const result = await collectAnswers(undefined, {}, true);
    expect(prompts.arrowSelect).toHaveBeenCalledTimes(1);
    expect(prompts.arrowMultiSelect).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      runtime: "local",
      frontend: frontends.find((f) => f.local)?.id,
      backend: { language: defaultLanguage?.id, framework: defaultFramework },
      extras: [],
    });
  });

  it("the first menu names outcomes in plain words, and none of its text needs a technical term", async () => {
    prompts.arrowSelect.mockResolvedValueOnce("web");
    prompts.arrowText.mockResolvedValueOnce("my-app");
    await collectAnswers(undefined, {}, true);
    const menu = prompts.arrowSelect.mock.calls[0]?.[0];
    const words = menu.choices
      .map((c: { title: string; hint?: string }) => `${c.title} ${c.hint ?? ""}`)
      .join(" ");
    for (const term of ["SDK", "CLI", "tooling", "React", "Vite", "Hono", "Docker", "Tilt"]) {
      expect(words, term).not.toContain(term);
    }
    expect(menu.choices.map((c: { value: string }) => c.value)).toContain("custom");
  });

  it.each([
    ["recruiter", "web"],
    ["product manager", "both"],
    ["founder", "both"],
    ["recipe cook", "web"],
    ["mlops engineer", "api"],
  ])(
    "%s gets a project from one choice and a name, with no extra questions",
    async (_who, pick) => {
      prompts.arrowSelect.mockResolvedValueOnce(pick);
      prompts.arrowText.mockResolvedValueOnce("my-app");
      const result = await collectAnswers(undefined, {}, true);
      expect(prompts.arrowSelect).toHaveBeenCalledTimes(1);
      expect(isEmptyApp(result)).toBe(false);
      expect(result.runtime).toBe("local");
    },
  );

  it("the starter list shows the ones that run on this computer first", async () => {
    prompts.arrowSelect
      .mockResolvedValueOnce("starter")
      .mockResolvedValueOnce(starterCatalog()[0]?.id);
    prompts.arrowText.mockResolvedValueOnce("shop");
    await collectAnswers(undefined, {}, true);
    const rows = prompts.arrowSelect.mock.calls[1]?.[0].choices as { value: string }[];
    const local = new Map(starterCatalog().map((s) => [s.id, s.local]));
    const flags = rows.map((r) => local.get(r.value) === true);
    expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
  });

  it("a ready-made starter asks nothing about how it runs", async () => {
    const starter = starterCatalog()[0];
    prompts.arrowSelect.mockResolvedValueOnce("starter").mockResolvedValueOnce(starter?.id);
    prompts.arrowText.mockResolvedValueOnce("shop");
    const result = await collectAnswers(undefined, {}, true);
    expect(result.starter).toBe(starter?.id);
    expect(prompts.arrowSelect).toHaveBeenCalledTimes(2);
    expect(prompts.arrowSelect.mock.calls[1]?.[0].filterable).toBe(true);
  });

  it("does not ask for the name when it is given, and fails on a bad one before any question", async () => {
    prompts.arrowSelect.mockResolvedValueOnce("web");
    await collectAnswers("bot", {}, true);
    expect(prompts.arrowText).not.toHaveBeenCalled();
    expect(prompts.arrowSelect).toHaveBeenCalledTimes(1); // a website only: one plain question
    prompts.arrowSelect.mockReset();
    prompts.arrowMultiSelect.mockReset();
    await expect(collectAnswers("My_App", {}, true)).rejects.toThrow(/not a usable project name/);
    expect(prompts.arrowSelect).not.toHaveBeenCalled();
  });
});

describe("the review, the recovery message and the folder guard", () => {
  const local = {
    name: "shop",
    runtime: "local" as const,
    frontend: frontends[0]?.id,
    backend: { language: defaultLanguage?.id ?? "", framework: defaultFramework },
    extras: [],
  };

  it("says what is created, what it needs and what was chosen, and flags a missing program", () => {
    const lines = reviewLines(local, buildCreatePlan(local), (program) => program !== "npm");
    expect(lines[0]).toBe("Creating shop: shop-api, shop-web");
    expect(lines[1]).toContain("Not found on this machine: npm");
    expect(lines[2]).toMatch(/^Chosen: runtime: local · website: /);
  });

  it("says which address to open: the website, or the API's health check without one", () => {
    expect(
      whereToOpen([
        { dir: "api", run: "npm run dev", port: 4000 },
        { dir: "web", run: "npm run dev", port: 3000 },
      ]),
    ).toBe("Then open http://localhost:3000 in your browser.");
    expect(whereToOpen([{ dir: "api", run: "npm run dev", port: 4000 }])).toContain(
      "http://localhost:4000/health",
    );
    expect(whereToOpen([])).toBeUndefined();
  });

  it.each([
    ["devops engineer", "api"],
    ["html developer", "web"],
  ])("%s gets a local project from one plain choice", async (_who, pick) => {
    prompts.arrowSelect.mockReset();
    prompts.arrowSelect.mockResolvedValueOnce(pick);
    prompts.arrowText.mockResolvedValueOnce("my-app");
    const result = await collectAnswers(undefined, {}, true);
    expect(prompts.arrowSelect).toHaveBeenCalledTimes(1);
    expect(result.runtime).toBe("local");
  });

  it("turns a typed name into a folder name instead of refusing it", async () => {
    expect(toProjectName("My Shop!")).toBe("my-shop");
    expect(toProjectName("  Grandma's Recipes  ")).toBe("grandma-s-recipes");
    expect(toProjectName("!!!")).toBe("");
    prompts.arrowSelect.mockReset();
    prompts.arrowText.mockReset();
    prompts.arrowSelect.mockResolvedValueOnce("web");
    prompts.arrowText.mockResolvedValueOnce("My Shop!");
    expect((await collectAnswers(undefined, {}, true)).name).toBe("my-shop");
    const validate = prompts.arrowText.mock.calls[0]?.[0].validate;
    expect(validate("My Shop!")).toBe(true);
    expect(validate("!!!")).toMatch(/at least one letter/);
  });

  it("a starter that runs on this computer ends with flisk up and the page to open", () => {
    const local = starterCatalog().find((s) => s.local);
    const dir = mkdtempSync(join(tmpdir(), "flisk-create-starter-"));
    try {
      mkdirSync(join(dir, "coordinator"));
      writeFileSync(join(dir, "coordinator", "service.json"), JSON.stringify({ port: 4100 }));
      expect(firstPort(dir)).toBe(4100);
      const steps = nextSteps(dir, {
        name: "shop",
        starter: local?.id,
        runtime: "local",
        extras: [],
      });
      expect(steps.join("\n")).toContain("flisk up");
      expect(steps.join("\n")).toContain("http://localhost:4100");
      expect(steps.join("\n")).not.toContain("README");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--start needs npm even when Bun is installed, because the services run npm run dev", () => {
    expect(startBlockers(local, () => true)).toEqual([]);
    expect(startBlockers(local, (p) => p !== "npm")).toEqual(["npm"]);
    expect(startBlockers(local, (p) => p !== "npm" && p !== "bun")).toEqual(
      expect.arrayContaining(["npm", "bun"]),
    );
    expect(startBlockers({ ...local, starter: "x" }, () => false)).toEqual([]);
  });

  it('splits an install command the way a shell would, so pip gets .[dev] and not ".[dev]"', () => {
    expect(splitCommand("npm install")).toEqual(["npm", "install"]);
    expect(splitCommand('pip install -e ".[dev]"')).toEqual(["pip", "install", "-e", ".[dev]"]);
    expect(splitCommand("go mod tidy")).toEqual(["go", "mod", "tidy"]);
  });

  it("a folder it cannot inspect is a FliskError with a next step, not a raw permission error", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-create-perm-"));
    try {
      mkdirSync(join(dir, "locked"));
      chmodSync(join(dir, "locked"), 0o000);
      if (process.getuid?.() === 0) return; // root can read anything
      expect(() => assertFolderIsFree(join(dir, "locked", "my-app"))).toThrow(/Cannot check/);
    } finally {
      chmodSync(join(dir, "locked"), 0o755);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a Windows device name is not a usable project name", () => {
    for (const name of ["con", "nul", "aux", "prn", "com1", "lpt9"]) {
      expect(isValidProjectName(name), name).toBe(false);
    }
    expect(isValidProjectName("console")).toBe(true);
    expect(isValidProjectName("my-app")).toBe(true);
  });

  it("rejects --extras together with --starter before building any plan", async () => {
    await expect(
      collectAnswers("shop", { starter: starterCatalog()[0]?.id, extras: "worker" }, false),
    ).rejects.toThrow(/--extras cannot be combined with --starter/);
    await expect(
      collectAnswers("shop", { starter: starterCatalog()[0]?.id, extras: "none" }, false),
    ).resolves.toBeDefined();
  });

  it("the local install step drops the Docker-only note", () => {
    expect(
      localInstallHint('pip install -e ".[dev]"   # optional: Docker builds the image for you'),
    ).toBe('pip install -e ".[dev]"');
    expect(localInstallHint("npm install")).toBe("npm install");
    for (const language of Object.values(BACKEND_LANGUAGES)) {
      expect(localInstallHint(language.installHint)).not.toContain("Docker");
    }
  });

  it("tells a person how to get each missing program", () => {
    const lines = reviewLines(local, buildCreatePlan(local), (program) => program !== "npm");
    const text = lines.join("\n");
    expect(text).toContain("To install what is missing:");
    expect(text).toContain("https://nodejs.org");
    expect(reviewLines(local, buildCreatePlan(local), () => true).join("\n")).not.toContain(
      "To install",
    );
  });

  it("after a failure it says what finished, what did not run, and how to start over", () => {
    const steps = buildCreatePlan(local);
    const lines = recoveryMessage("/work/shop", steps, 1);
    expect(lines[0]).toContain("/work/shop is incomplete");
    expect(lines).toContain(`  done: ${steps[0]?.label}`);
    expect(lines).toContain(`  not run: ${steps[2]?.label}`);
    expect(lines.join("\n")).not.toContain("rm -rf");
    expect(lines.join("\n")).toContain('"/work/shop"');
  });

  it("claimFolder re-checks the folder, so files that appear after the first check are never written over", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk create guard "));
    try {
      const target = join(dir, "my app");
      assertFolderIsFree(target); // first check passes
      mkdirSync(target); // another process fills it before create writes
      writeFileSync(join(target, "keep.txt"), "mine");
      expect(() => claimFolder(target)).toThrow(/already exists and is not empty/);
      expect(readFileSync(join(target, "keep.txt"), "utf8")).toBe("mine");
      expect(claimFolder(join(dir, "nested", "fresh app"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("claimFolder claims an existing empty folder, and refuses it once something is inside", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-create-empty-"));
    try {
      const empty = join(dir, "empty");
      mkdirSync(empty);
      claimFolder(empty);
      expect(readdirSync(empty)).toEqual([]);
      writeFileSync(join(empty, "late.txt"), "theirs");
      expect(() => claimFolder(empty)).toThrow(/not empty/);
      expect(readFileSync(join(empty, "late.txt"), "utf8")).toBe("theirs");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a link as the project folder, even one to an empty folder", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-create-link-"));
    try {
      mkdirSync(join(dir, "elsewhere"));
      symlinkSync(join(dir, "elsewhere"), join(dir, "my-app"));
      expect(() => assertFolderIsFree(join(dir, "my-app"))).toThrow(/is a link/);
      expect(() => claimFolder(join(dir, "my-app"))).toThrow(/is a link/);
      expect(readdirSync(join(dir, "elsewhere"))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("claimFolder says whether it made the folder, and the recovery text follows", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-create-own-"));
    try {
      expect(claimFolder(join(dir, "fresh"))).toBe(true);
      mkdirSync(join(dir, "theirs"));
      expect(claimFolder(join(dir, "theirs"))).toBe(false);
      const steps = buildCreatePlan(local);
      expect(recoveryMessage("/w/s", steps, 1, true).join("\n")).toContain("made this folder");
      const taken = recoveryMessage("/w/s", steps, 1, false).join("\n");
      expect(taken).not.toContain("made this folder");
      expect(taken).toContain("already there");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("names a destination that is a file instead of failing with a raw error", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-create-file-"));
    try {
      writeFileSync(join(dir, "my-app"), "a file");
      expect(() => assertFolderIsFree(join(dir, "my-app"))).toThrow(
        /already exists and is not a folder/,
      );
      expect(() => claimFolder(join(dir, "my-app"))).toThrow(/not a folder/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a folder that already has files, but accepts a missing or empty one", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-create-guard-"));
    try {
      expect(() => assertFolderIsFree(join(dir, "new"))).not.toThrow();
      mkdirSync(join(dir, "full"));
      writeFileSync(join(dir, "full", "keep.txt"), "mine");
      expect(() => assertFolderIsFree(join(dir, "full"))).toThrow(
        /already exists and is not empty/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Runs the real CLI in a fresh folder; the folder is removed after the test. */
function inTempDir() {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "flisk-create-cli-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  return () => dir;
}

describe("flisk create (the real CLI, no terminal)", () => {
  const dirOf = inTempDir();

  it("--dry-run prints the real flisk commands and writes nothing", () => {
    const run = runFlisk(["create", "shop", "--dry-run"], { cwd: dirOf(), timeout: 60_000 });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("flisk project --yes");
    expect(run.stdout).toContain("flisk resource shop-api --type backend");
    expect(run.stdout).toContain("--local");
    expect(run.stdout).toContain("Dry run: nothing was written");
    expect(existsSync(join(dirOf(), "shop"))).toBe(false);
  });

  it("the default is a local website and API: no Docker artifacts anywhere", () => {
    const run = runFlisk(["create", "shop", "--yes"], { cwd: dirOf(), timeout: 120_000 });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const project = join(dirOf(), "shop");
    for (const file of ["web/service.json", "web/package.json", "api/service.json"]) {
      expect(existsSync(join(project, file)), file).toBe(true);
    }
    for (const dir of ["web", "api"]) {
      expect(existsSync(join(project, dir, "Dockerfile")), `${dir}/Dockerfile`).toBe(false);
      const service = JSON.parse(readFileSync(join(project, dir, "service.json"), "utf8"));
      expect(typeof service.command).toBe("string");
      expect(service).not.toHaveProperty("build");
    }
    expect(existsSync(join(project, "web", "vite.config.ts"))).toBe(true);
    expect(run.stdout).toContain("No Docker, no Tilt, no database");
  });

  it("the website's proxy points at the port the API was given", () => {
    // Which port is free is findFreePort's job (tested on its own); create's job is to keep the parts in agreement.
    const run = runFlisk(["create", "shop", "--yes"], { cwd: dirOf(), timeout: 120_000 });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const project = join(dirOf(), "shop");
    const apiPort = JSON.parse(readFileSync(join(project, "api", "service.json"), "utf8")).port;
    const vite = readFileSync(join(project, "web", "vite.config.ts"), "utf8");
    expect(vite).toContain(`http://localhost:${apiPort}`);
    expect(vite).toContain("strictPort: true");
  });

  it("an API-only project is started with flisk up, which gives it the port in its service.json", () => {
    const run = runFlisk(["create", "solo-api", "--frontend", "none", "--yes"], {
      cwd: dirOf(),
      timeout: 120_000,
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const port = JSON.parse(
      readFileSync(join(dirOf(), "solo-api", "api", "service.json"), "utf8"),
    ).port;
    expect(run.stdout).toContain("flisk up");
    expect(run.stdout).not.toContain("npm run dev");
    expect(run.stdout).toContain(`http://localhost:${port}/health`);
  });

  it.each([
    ["bun", []],
    ["node", ["--language", "node"]],
    ["go", ["--language", "go"]],
    ["python", ["--language", "python"]],
    ["rust", ["--language", "rust"]],
  ])("a local %s API listens on localhost, never on every interface", (_name, extra) => {
    const run = runFlisk(["create", "svc", "--frontend", "none", ...extra, "--yes"], {
      cwd: dirOf(),
      timeout: 120_000,
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(join(dirOf(), "svc", "api"));
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toContain("0.0.0.0");
    }
  });

  it("flisk resource --local is refused for databases and for Prisma, and leaves no folder behind", () => {
    const made = runFlisk(["create", "base", "--frontend", "none", "--yes"], {
      cwd: dirOf(),
      timeout: 120_000,
    });
    expect(made.status, made.stdout + made.stderr).toBe(0);
    const project = join(dirOf(), "base");
    const db = runFlisk(["resource", "db1", "--type", "database", "--local", "--yes"], {
      cwd: project,
      timeout: 60_000,
    });
    expect(db.status).not.toBe(0);
    expect(db.stdout + db.stderr).toContain("--local applies to frontend and backend resources");
    const prisma = runFlisk(
      ["resource", "pr1", "--type", "backend", "--feature", "prisma", "--local", "--yes"],
      { cwd: project, timeout: 60_000 },
    );
    expect(prisma.status).not.toBe(0);
    expect(prisma.stdout + prisma.stderr).toContain("cannot be combined with --feature prisma");
    expect(existsSync(join(project, "services", "app", "pr1"))).toBe(false);
    expect(existsSync(join(project, "services", "app", "db1"))).toBe(false);
  });

  it("the printed next steps match what was generated", () => {
    const run = runFlisk(["create", "shop", "--yes"], { cwd: dirOf(), timeout: 120_000 });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const project = join(dirOf(), "shop");
    const printed = run.stdout.slice(run.stdout.indexOf("Next:"));
    const services = generatedServices(project, {
      name: "shop",
      runtime: "local",
      frontend: frontends[0]?.id,
      backend: { language: defaultLanguage?.id ?? "", framework: defaultFramework },
      extras: [],
    });
    // Two local services: install each one that has a package.json, then flisk up starts both.
    expect(services.map((s) => s.dir)).toEqual(["web", "api"]);
    for (const service of services) {
      const hasPackage = existsSync(join(project, service.dir, "package.json"));
      expect(printed.includes(`(cd ${service.dir} && npm install)`), service.dir).toBe(hasPackage);
      const scripts = hasPackage
        ? JSON.parse(readFileSync(join(project, service.dir, "package.json"), "utf8")).scripts
        : {};
      expect(service.run).toBe(scripts.dev ? "npm run dev" : "");
    }
    expect(printed).toContain("flisk up");
    expect(printed).toContain("cd shop");
  });

  it("a single local service prints cd, install and flisk up", () => {
    const run = runFlisk(["create", "solo", "--backend", "none", "--yes"], {
      cwd: dirOf(),
      timeout: 120_000,
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const scripts = JSON.parse(
      readFileSync(join(dirOf(), "solo", "web", "package.json"), "utf8"),
    ).scripts;
    expect(scripts.dev).toBe("vite");
    expect(run.stdout).toContain("cd solo");
    expect(run.stdout).toContain("(cd web && npm install)");
    // flisk up hands the part the port in its service.json; a bare "npm run dev" would not.
    expect(run.stdout).toContain("flisk up");
    expect(run.stdout).not.toContain("npm run dev");
  });

  it("the Docker route still writes the container-based project", () => {
    const run = runFlisk(["create", "shop", "--runtime", "docker", "--yes"], {
      cwd: dirOf(),
      timeout: 180_000,
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const web = join(dirOf(), "shop", "services", "app", "shop-web");
    expect(existsSync(join(web, "Dockerfile"))).toBe(true);
    expect(existsSync(join(web, "vite.config.ts"))).toBe(false);
    expect(run.stdout).toContain("flisk up app");
    expect(run.stdout).toMatch(/Docker and Tilt/);
  }, 240_000);

  it("infrastructure is only added when it is asked for", () => {
    const withExtra = runFlisk(["create", "shop", "--extras", "worker", "--yes"], {
      cwd: dirOf(),
      timeout: 180_000,
    });
    expect(withExtra.status, withExtra.stdout + withExtra.stderr).toBe(0);
    expect(
      existsSync(join(dirOf(), "shop", "services", "app", "shop-worker", "service.json")),
    ).toBe(true);
    const plain = runFlisk(["create", "plain", "--yes"], { cwd: dirOf(), timeout: 120_000 });
    expect(plain.status, plain.stdout + plain.stderr).toBe(0);
    // flisk project makes an empty services folder; what matters is that no resource was added to it.
    expect(existsSync(join(dirOf(), "plain", "services", "app"))).toBe(false);
    expect(existsSync(join(dirOf(), "plain", "web", "service.json"))).toBe(true);
  }, 240_000);

  it("a starter the CLI writes itself is created and needs no Docker", () => {
    const starter = starterCatalog().find((s) => s.local);
    const run = runFlisk(["create", "bots", "--starter", starter?.id ?? "", "--yes"], {
      cwd: dirOf(),
      timeout: 120_000,
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(existsSync(join(dirOf(), "bots"))).toBe(true);
    expect(run.stdout).toContain("cd bots");
  });

  it("refuses a folder that already has files and leaves them alone", () => {
    mkdirSync(join(dirOf(), "shop"));
    writeFileSync(join(dirOf(), "shop", "keep.txt"), "mine");
    const run = runFlisk(["create", "shop", "--yes"], { cwd: dirOf(), timeout: 60_000 });
    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain("already exists and is not empty");
    expect(readFileSync(join(dirOf(), "shop", "keep.txt"), "utf8")).toBe("mine");
  });

  it("names the valid choices for a wrong flag and exits non-zero", () => {
    const run = runFlisk(["create", "shop", "--frontend", "nope", "--dry-run"], {
      cwd: dirOf(),
      timeout: 60_000,
    });
    expect(run.status).not.toBe(0);
    expect(run.stdout + run.stderr).toContain(frontends[0]?.id);
  });
});

describe("every generator remains selectable and produces a valid local project", () => {
  const dirOf = inTempDir();

  const parse = (file: string) => JSON.parse(readFileSync(file, "utf8"));

  it("each frontend in the registry", () => {
    for (const frontend of frontends.filter((f) => f.local)) {
      const run = runFlisk(
        ["create", `app-${frontend.id}`, "--frontend", frontend.id, "--backend", "none", "--yes"],
        { cwd: dirOf(), timeout: 120_000 },
      );
      expect(run.status, `${frontend.id}: ${run.stdout}${run.stderr}`).toBe(0);
      const web = join(dirOf(), `app-${frontend.id}`, "web");
      expect(existsSync(join(web, "Dockerfile")), `${frontend.id} Dockerfile`).toBe(false);
      const pkg = parse(join(web, "package.json"));
      expect(typeof pkg.scripts.dev, `${frontend.id} dev script`).toBe("string");
      expect(JSON.stringify(pkg.scripts)).not.toContain("autogenerated");
      const service = parse(join(web, "service.json"));
      expect(service.command, `${frontend.id} command`).toBe("npm run dev");
      expect(existsSync(join(web, "index.html")) || existsSync(join(web, "next.config.mjs"))).toBe(
        true,
      );
    }
  }, 600_000);

  it("each backend framework and language in the registry", () => {
    const choices = backends.flatMap((language) =>
      language.frameworks.length > 0
        ? language.frameworks.map((framework) => ["--backend", framework.id])
        : [["--language", language.id]],
    );
    for (const flags of choices) {
      const label = flags.join(" ");
      const run = runFlisk(["create", `api-${flags[1]}`, "--frontend", "none", ...flags, "--yes"], {
        cwd: dirOf(),
        timeout: 120_000,
      });
      expect(run.status, `${label}: ${run.stdout}${run.stderr}`).toBe(0);
      const api = join(dirOf(), `api-${flags[1]}`, "api");
      expect(existsSync(join(api, "Dockerfile")), `${label} Dockerfile`).toBe(false);
      const service = parse(join(api, "service.json"));
      expect(typeof service.command, `${label} command`).toBe("string");
      expect(service).not.toHaveProperty("build");
      // A language with its own package.json runs through its dev script; one without runs its own dev command.
      const language = BACKEND_LANGUAGES[service.language ?? backends[0]?.id ?? ""];
      if (existsSync(join(api, "package.json"))) {
        expect(service.command).toBe("npm run dev");
        expect(typeof parse(join(api, "package.json")).scripts.dev).toBe("string");
      } else if (language?.devCommand) {
        // The registry command listens on every interface for a container; the local one on localhost.
        expect(service.command).toBe(language.devCommand.replaceAll("0.0.0.0", "localhost"));
      }
    }
  }, 600_000);
});

/** The first of npm and bun that runs, to install the generated app's dependencies. */
function packageManager(): string | undefined {
  for (const candidate of ["npm", "bun"]) {
    if (spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0) return candidate;
  }
  return undefined;
}

describe("a generated website runs without Docker or Tilt", () => {
  const pm = packageManager();
  const dirOf = inTempDir();
  let server: ChildProcess | undefined;
  afterEach(() => {
    if (server?.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  });

  it.skipIf(!pm)(
    "creates, installs and serves the default website while docker and tilt are broken",
    async () => {
      const shims = join(dirOf(), "shims");
      mkdirSync(shims);
      const marker = join(dirOf(), "container-tool-was-called");
      for (const tool of ["docker", "tilt"]) {
        const file = join(shims, tool);
        writeFileSync(file, `#!/bin/sh\necho ${tool} >> "${marker}"\nexit 127\n`);
        chmodSync(file, 0o755);
      }
      const PATH = `${shims}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`;

      const created = runFlisk(["create", "my-app", "--backend", "none", "--yes"], {
        cwd: dirOf(),
        timeout: 120_000,
        env: { PATH },
      });
      expect(created.status, created.stdout + created.stderr).toBe(0);
      const web = join(dirOf(), "my-app", "web");

      const install = spawnSync(pm as string, ["install"], {
        cwd: web,
        env: { ...process.env, PATH },
        encoding: "utf8",
        timeout: 240_000,
      });
      expect(install.status, install.stdout + install.stderr).toBe(0);

      const port = await freePort();
      server = spawn(pm as string, ["run", "dev"], {
        cwd: web,
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
      const html = await page?.text();
      const entry = /src="(\/src\/[^"]+)"/.exec(html ?? "")?.[1];
      expect(entry, "the page has no app entry").toBeDefined();
      // Fetching the entry makes Vite compile it with the framework's own plugin.
      expect((await fetch(`${base}${entry}`)).status).toBe(200);
      expect(existsSync(marker), "docker or tilt was called").toBe(false);
    },
    360_000,
  );
});

describe("nextSteps", () => {
  it("a Docker project gets flisk up app, a starter its README, a single local service its own command", () => {
    expect(nextSteps("/x", { name: "a", runtime: "docker", extras: [], frontend: "f" })).toEqual([
      "cd a",
      "flisk up app",
    ]);
    expect(nextSteps("/x", { name: "a", runtime: "docker", extras: [], starter: "demo" })).toEqual([
      "cd a",
      "Read its README for what it needs, then run it.",
    ]);
    expect(
      nextSteps("/x", { name: "a", runtime: "local", extras: [], frontend: "f" }, [
        { dir: "web", install: "npm install", run: "npm run dev" },
      ]),
    ).toEqual(["cd a", "(cd web && npm install)", "flisk up        # starts it"]);
  });
});

describe("asksToStart", () => {
  it("the start ask belongs to the local app route alone: never a starter, never the Docker route", () => {
    expect(asksToStart({ name: "a", runtime: "local", extras: [], frontend: "f" })).toBe(true);
    expect(asksToStart({ name: "a", runtime: "docker", extras: [], frontend: "f" })).toBe(false);
    expect(asksToStart({ name: "a", runtime: "local", extras: [], starter: "swarm" })).toBe(false);
    expect(asksToStart({ name: "a", runtime: "docker", extras: [], starter: "demo" })).toBe(false);
  });
});

describe("regressions from the first hand test", () => {
  const dirOf = inTempDir();

  it("a starter writes its files and never starts Docker or a stack", () => {
    const run = runFlisk(["create", "bots", "--starter", "demo", "--yes"], {
      cwd: dirOf(),
      timeout: 120_000,
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(existsSync(join(dirOf(), "bots", "README.md"))).toBe(true);
    expect(run.stdout).not.toMatch(/flisk up|Tilt|init-networks/);
    expect(run.stdout).toContain("Read its README");
  });

  it("a starter is not started even when --start asks for it", () => {
    const run = runFlisk(["create", "bots", "--starter", "demo", "--yes", "--start"], {
      cwd: dirOf(),
      timeout: 120_000,
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).not.toMatch(/flisk up|Tilt|init-networks/);
    expect(run.stdout).toContain("Read its README");
    expect(run.stdout).not.toContain("Install dependencies and start it now?");
    expect(existsSync(join(dirOf(), "bots", "README.md"))).toBe(true);
  });

  it("a starter is never offered the 'start it now' question, even on a terminal", async () => {
    prompts.arrowSelect.mockResolvedValueOnce("starter").mockResolvedValueOnce("demo");
    prompts.arrowText.mockResolvedValueOnce("bots");
    await collectAnswers(undefined, {}, true);
    const messages = prompts.arrowSelect.mock.calls.map((call) => call[0].message);
    expect(messages).not.toContain("Install dependencies and start it now?");
    expect(asksToStart(await collectAnswers("bots", { starter: "demo" }, true))).toBe(false);
  });

  it("the starter menu marks each starter's runtime in plain words", async () => {
    prompts.arrowSelect.mockResolvedValueOnce("starter").mockResolvedValueOnce("demo");
    prompts.arrowText.mockResolvedValueOnce("bots");
    await collectAnswers(undefined, {}, true);
    const choices = prompts.arrowSelect.mock.calls[1]?.[0].choices as { hint: string }[];
    expect(choices.some((c) => c.hint.includes("runs on your computer"))).toBe(true);
    expect(choices.some((c) => c.hint.includes("needs Docker, see its README"))).toBe(true);
  });
});

describe("the menu redraw", () => {
  it("a frame's terminal line count includes wrapped rows", async () => {
    const { framedLines, fitRow } = await import("../../utils/arrow-prompt.js");
    expect(framedLines(["short", "x".repeat(50)], 20)).toBe(1 + 3);
    expect(framedLines(["a", "b"], 80)).toBe(2);
    expect(fitRow("y".repeat(200), 40).length).toBeLessThanOrEqual(40);
    expect(fitRow("short", 40)).toBe("short");
  });
});
