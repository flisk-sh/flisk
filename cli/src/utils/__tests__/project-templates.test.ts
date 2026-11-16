// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createProgram } from "../../program.js";
import {
  bareTemplateArg,
  bundledTemplateRootCandidates,
  listProjectTemplates,
  PROJECT_TEMPLATES,
  resolveBundledTemplateDir,
  templateGitCommands,
  templateTargetDir,
} from "../project-templates.js";

const exampleRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../examples/flisk-example",
);

describe("PROJECT_TEMPLATES", () => {
  it("offers every public example repo", () => {
    expect(Object.keys(PROJECT_TEMPLATES).sort()).toEqual([
      "agent-stack",
      "demo",
      "ecommerce",
      "erp",
      "example",
      "fullstack",
      "langgraph",
      "launch",
      "next-postgres",
      "portal",
      "restaurant",
      "saas",
      "security",
      "super-agent",
      "swarm",
      "tool-loop",
      "user-management",
    ]);
  });

  it("points demo at the restaurant example", () => {
    expect(PROJECT_TEMPLATES.demo.repo).toBe(PROJECT_TEMPLATES.restaurant.repo);
  });

  it("demo template has fixedDir for consistent demo location", () => {
    expect(PROJECT_TEMPLATES.demo.fixedDir).toBe("flisk-demo");
  });

  it("points ecommerce at flisk-ecommerce-example", () => {
    expect(PROJECT_TEMPLATES.ecommerce.repo).toBe(
      "https://github.com/flisk-sh/flisk-ecommerce-example.git",
    );
  });

  it("bundles the product example with the CLI package", () => {
    expect(PROJECT_TEMPLATES.example.bundledPath).toBe("examples/flisk-example");
    expect(PROJECT_TEMPLATES.example.description).toContain("in the background");
    const manifests = [
      "services/shop/orders-api/service.json",
      "services/shop/orders-worker/service.json",
      "services/shop/orders-app/service.json",
    ].map((path) => JSON.parse(readFileSync(resolve(exampleRoot, path), "utf-8")));
    expect(manifests.map((manifest) => manifest.appType)).toEqual([
      "backend",
      "worker",
      "frontend",
    ]);
    expect(manifests[0].featuresEnabled).toContain("nats");
    expect(manifests[1].featuresEnabled).toContain("nats");
    expect(existsSync(resolve(exampleRoot, "services/platform/messaging/docker-compose.yml"))).toBe(
      true,
    );
    expect(
      readFileSync(resolve(exampleRoot, "services/shop/orders-api/src/index.ts"), "utf-8"),
    ).toContain("INSERT INTO demo_orders");
    expect(
      readFileSync(resolve(exampleRoot, "services/shop/orders-worker/src/index.ts"), "utf-8"),
    ).toContain("UPDATE demo_orders SET worker_seen_at");
  });

  it("gives every template a github repo and a description", () => {
    for (const [name, t] of Object.entries(PROJECT_TEMPLATES)) {
      expect(t.repo, name).toMatch(/^https:\/\/github\.com\/flisk-sh\/[\w-]+\.git$/);
      expect(t.description, name).not.toBe("");
    }
  });

  it("pins launch, portal and fullstack to a full commit SHA", () => {
    expect(PROJECT_TEMPLATES.launch).toMatchObject({
      repo: "https://github.com/flisk-sh/flisk-template-launch.git",
      ref: "f97e03a11d026715573a610a8370c3c7546c5af8",
    });
    expect(PROJECT_TEMPLATES.portal).toMatchObject({
      repo: "https://github.com/flisk-sh/flisk-template-portal.git",
      ref: "0d57988acca78ff6649d861edcc683ece2afff22",
    });
    expect(PROJECT_TEMPLATES.fullstack).toMatchObject({
      repo: "https://github.com/flisk-sh/flisk-stack.git",
      ref: "fff53f3c77d0daea1f34498c70fe48a9e372b682",
    });
    for (const [name, t] of Object.entries(PROJECT_TEMPLATES)) {
      if (t.ref !== undefined) expect(t.ref, name).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it("never names a template after a top-level command", () => {
    // `flisk <template>` is the one-command flow, so a template named like a command would shadow it.
    const program = createProgram();
    const commandNames = new Set([
      "help",
      ...program.commands.flatMap((command) => [command.name(), ...command.aliases()]),
    ]);
    expect(commandNames).toContain("stack");
    expect(commandNames).toContain("project");
    const clashes = Object.keys(PROJECT_TEMPLATES).filter((key) => commandNames.has(key));
    expect(clashes).toEqual([]);
  });
});

describe("templateTargetDir", () => {
  it("names generated and composed starters after the starter, not the main repository", () => {
    for (const name of [
      "swarm",
      "security",
      "super-agent",
      "langgraph",
      "tool-loop",
      "next-postgres",
    ]) {
      expect(PROJECT_TEMPLATES[name]?.repo).toBe("https://github.com/flisk-sh/flisk.git");
      expect(templateTargetDir(name), name).toBe(name);
    }
    const folders = Object.keys(PROJECT_TEMPLATES).map((name) => templateTargetDir(name));
    expect(new Set(folders).size).toBe(folders.length - 1); // demo and restaurant are one repository
  });

  it("keeps the repository name for starters that are cloned", () => {
    expect(templateTargetDir("restaurant")).toBe("flisk-restaurant-example");
    expect(templateTargetDir("example")).toBe("flisk-example");
    expect(templateTargetDir("launch")).toBe("flisk-template-launch");
  });

  it("falls back to the name when a starter is unknown", () => {
    expect(templateTargetDir("unknown-starter.git")).toBe("unknown-starter");
  });
});

describe("listProjectTemplates", () => {
  it("lists every template in registration order with key, repo, description and its ref only when pinned", () => {
    const rows = listProjectTemplates();
    expect(rows.map((row) => row.key)).toEqual(Object.keys(PROJECT_TEMPLATES));
    for (const row of rows) {
      const template = PROJECT_TEMPLATES[row.key];
      expect(row).toEqual({
        key: row.key,
        repo: template?.repo,
        description: template?.description,
        ...(template?.ref ? { ref: template.ref } : {}),
      });
    }
    expect(rows.find((row) => row.key === "saas")).not.toHaveProperty("ref");
  });
});

describe("templateGitCommands", () => {
  it("clones and then moves the default branch to the pinned commit", () => {
    expect(templateGitCommands({ repo: "r.git", description: "", ref: "abc" }, "/tmp/x")).toEqual([
      ["clone", "r.git", "/tmp/x"],
      ["-C", "/tmp/x", "reset", "--hard", "--quiet", "abc"],
      ["-C", "/tmp/x", "remote", "rename", "origin", "upstream"],
    ]);
  });

  it("leaves a pinned starter on a named branch whose tip is the pinned commit (#4286)", () => {
    const work = mkdtempSync(join(tmpdir(), "flisk-template-git-"));
    try {
      const git = (cwd: string, ...args: string[]) =>
        execFileSync(
          "git",
          [
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "-c",
            "commit.gpgsign=false",
            ...args,
          ],
          {
            cwd,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
          },
        ).trim();
      const source = join(work, "starter");
      mkdirSync(source);
      git(source, "init", "--quiet", "--initial-branch=main");
      writeFileSync(join(source, "a.txt"), "1\n");
      git(source, "add", ".");
      git(source, "commit", "--quiet", "-m", "pinned");
      const pinned = git(source, "rev-parse", "HEAD");
      writeFileSync(join(source, "a.txt"), "2\n");
      git(source, "commit", "--quiet", "-am", "newer");

      const destination = join(work, "project");
      for (const args of templateGitCommands(
        { repo: source, description: "", ref: pinned },
        destination,
      )) {
        git(work, ...args);
      }

      expect(git(destination, "symbolic-ref", "--short", "HEAD")).toBe("main");
      expect(git(destination, "rev-parse", "HEAD")).toBe(pinned);
      expect(readFileSync(join(destination, "a.txt"), "utf-8")).toBe("1\n");
      expect(git(destination, "status", "--porcelain")).toBe("");
      writeFileSync(join(destination, "a.txt"), "mine\n");
      git(destination, "commit", "--quiet", "-am", "first edit");
      expect(git(destination, "branch", "--contains", "HEAD", "--format=%(refname:short)")).toBe(
        "main",
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("shallow-clones an unpinned template and keeps its source as upstream", () => {
    expect(templateGitCommands({ repo: "r.git", description: "" }, "/tmp/x")).toEqual([
      ["clone", "--depth", "1", "r.git", "/tmp/x"],
      ["-C", "/tmp/x", "remote", "rename", "origin", "upstream"],
    ]);
  });
});

describe("bareTemplateArg", () => {
  it("reads the one-command form", () => {
    expect(bareTemplateArg(["node", "flisk", "demo"])).toBe("demo");
    expect(bareTemplateArg(["node", "flisk", "fullstack"])).toBe("fullstack");
    expect(bareTemplateArg(["node", "flisk", "restaurant", "--project=my-stack"])).toBe(
      "restaurant",
    );
  });

  it("leaves a command that takes a template of its own alone", () => {
    // `flisk project demo` clones a starter and configures it; it is not the one-command flow.
    expect(bareTemplateArg(["node", "flisk", "project", "demo"])).toBeUndefined();
    expect(bareTemplateArg(["node", "flisk", "project", "example", "--path", "x"])).toBeUndefined();
    expect(bareTemplateArg(["node", "flisk", "up", "demo"])).toBeUndefined();
  });

  it("reads nothing from a flag or an unknown name", () => {
    expect(bareTemplateArg(["node", "flisk", "--template", "demo"])).toBeUndefined();
    expect(bareTemplateArg(["node", "flisk", "not-a-template"])).toBeUndefined();
    expect(bareTemplateArg(["node", "flisk"])).toBeUndefined();
  });
});

describe("resolveBundledTemplateDir", () => {
  it("uses the package root when it holds the example", () => {
    const exists = (path: string) => path === "/pkg/examples/flisk-example";
    const result = resolveBundledTemplateDir(
      "examples/flisk-example",
      {
        packageRoot: "/pkg",
        exeDir: "/usr/local/bin",
        workingDir: "/work",
      },
      exists,
    );
    expect(result).toBe("/pkg/examples/flisk-example");
  });

  it("falls back to the engine bundle when the package root has no examples/ (#3880)", () => {
    const exists = (path: string) => path === "/usr/local/bin/flisk-cli/examples/flisk-example";
    const result = resolveBundledTemplateDir(
      "examples/flisk-example",
      {
        packageRoot: "/",
        exeDir: "/usr/local/bin",
        workingDir: "/work",
      },
      exists,
    );
    expect(result).toBe("/usr/local/bin/flisk-cli/examples/flisk-example");
  });

  it("falls back to an installed @flisk-sh/flisk", () => {
    const exists = (path: string) =>
      path === "/work/node_modules/@flisk-sh/flisk/examples/flisk-example";
    const result = resolveBundledTemplateDir(
      "examples/flisk-example",
      {
        packageRoot: "/pkg",
        exeDir: "/usr/local/bin",
        workingDir: "/work",
      },
      exists,
    );
    expect(result).toBe("/work/node_modules/@flisk-sh/flisk/examples/flisk-example");
  });

  it("returns null when no candidate exists", () => {
    const exists = () => false;
    const result = resolveBundledTemplateDir(
      "examples/flisk-example",
      {
        packageRoot: "/pkg",
        exeDir: "/usr/local/bin",
        workingDir: "/work",
      },
      exists,
    );
    expect(result).toBeNull();
  });

  it("bundledTemplateRootCandidates lists the three roots in order", () => {
    const result = bundledTemplateRootCandidates({
      packageRoot: "/pkg",
      exeDir: "/usr/local/bin",
      workingDir: "/work",
    });
    expect(result).toEqual([
      "/pkg",
      "/usr/local/bin/flisk-cli",
      "/work/node_modules/@flisk-sh/flisk",
    ]);
  });
});
