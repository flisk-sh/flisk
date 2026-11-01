// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createProgram } from "../../program.js";
import {
  bareTemplateArg,
  listProjectTemplates,
  PROJECT_TEMPLATES,
  templateGitCommands,
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
      "launch",
      "portal",
      "restaurant",
      "saas",
      "security",
      "super-agent",
      "swarm",
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
    expect(PROJECT_TEMPLATES.example.description).toContain("NATS worker");
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
  it("clones and then checks out the pinned commit", () => {
    expect(templateGitCommands({ repo: "r.git", description: "", ref: "abc" }, "/tmp/x")).toEqual([
      ["clone", "r.git", "/tmp/x"],
      ["-C", "/tmp/x", "checkout", "--quiet", "--detach", "abc"],
    ]);
  });

  it("only clones an unpinned template", () => {
    expect(templateGitCommands({ repo: "r.git", description: "" }, "/tmp/x")).toEqual([
      ["clone", "r.git", "/tmp/x"],
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
