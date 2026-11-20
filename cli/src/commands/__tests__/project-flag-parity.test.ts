// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";
import { absoluteProjectArgs } from "../../utils/project-resolution.js";

function project(): string {
  return createTempProject({
    projectJson: {
      version: "1.0",
      project: { name: "parity-fixture", version: "1.0.0" },
      phases: {
        pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: ["app"] },
        alpha: { name: "Alpha", description: "", enabledStacks: [] },
        beta: { name: "Beta", description: "", enabledStacks: [] },
        out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
      },
      optional_infra: {
        monitoring: false,
        elk: false,
        debezium: false,
        golden_image: false,
        verdaccio: false,
      },
      discovery: { paths: ["services/*/*"] },
    },
    stacks: { app: { gateway: { appType: "backend", port: 3100 } } },
    resources: { "worker/queue": { appType: "worker" } },
  });
}

function outside(): string {
  return createTempProject({ projectJson: null });
}

function realpath(path: string): string {
  // macOS temp dirs are symlinked; Commander resolves the value against process.cwd().
  return realpathSync(path);
}

describe("shared --project option parity", () => {
  const cases: Array<{
    name: string;
    args: string[];
    json: boolean;
    expectFailure?: string;
    isolatePath?: boolean;
  }> = [
    { name: "stacks", args: ["stacks", "--json"], json: true },
    { name: "resources", args: ["resources", "--json"], json: true },
    { name: "networks", args: ["networks", "--json"], json: true },
    { name: "doctor", args: ["doctor", "--json"], json: true },
    { name: "config", args: ["config", "verify", "--json"], json: true },
    {
      name: "config regenerate",
      args: ["config", "regenerate", "--dry-run", "--json"],
      json: true,
    },
    {
      name: "config migrate",
      args: ["config", "migrate", "--json"],
      json: false,
      expectFailure: "required field is missing",
    },
    {
      name: "config explain",
      args: ["config", "explain", ".flisk/project.json", "--json"],
      json: true,
    },
    {
      name: "config enable-infra",
      args: ["config", "enable-infra", "monitoring", "--json"],
      json: true,
    },
    {
      name: "config disable-infra",
      args: ["config", "disable-infra", "monitoring", "--json"],
      json: true,
    },
    {
      name: "down",
      args: ["down", "--dry-run", "--json"],
      json: false,
      isolatePath: true,
      // With an isolated PATH (no tilt binary), reaching the Tilt check proves
      // --project resolved the fixture project root without touching real Docker/Tilt.
      expectFailure: "Tilt CLI is not installed",
    },
    {
      name: "restart",
      args: ["restart", "gateway", "--json"],
      json: false,
      expectFailure: "Could not reach Tilt on port",
    },
    { name: "status", args: ["status", "--json"], json: true },
    {
      name: "logs",
      args: ["logs", "--json"],
      json: false,
      isolatePath: true,
      expectFailure: "Tilt is not installed",
    },
    { name: "connect", args: ["connect", "claude", "--dry-run", "--json"], json: true },
    { name: "up", args: ["up", "--dry-run", "--json"], json: true },
  ];

  for (const { name, args, json, expectFailure, isolatePath } of cases) {
    it(`flisk ${name} --project <path> resolves another project's root`, () => {
      const root = realpath(project());
      const cwd = realpath(outside());
      const result = runFlisk([...args, "--project", root], {
        cwd,
        ...(isolatePath ? { env: { PATH: outside() } } : {}),
      });
      const combined = `${result.stdout}\n${result.stderr}`;

      expect(combined, combined).not.toContain("unknown option");
      expect(combined, combined).not.toContain("Could not find project root");
      if (expectFailure) {
        expect(combined, combined).toContain(expectFailure);
        return;
      }
      if (json) {
        const envelope = parseEnvelope(result.stdout);
        expect(envelope.errors, combined).toEqual([]);
      }
      if (name === "status") {
        const data = parseEnvelope(result.stdout).data;
        expect(data.stacks, combined).toMatchObject([{ name: "app", resourceCount: 1 }]);
        expect(data.resourceCount, combined).toBe(2);
      }
      if (name === "stacks") {
        expect(parseEnvelope(result.stdout).data.stacks, combined).toEqual([
          { name: "app", resourceCount: 1 },
        ]);
      }
      if (name === "resources") {
        const resources = parseEnvelope(result.stdout).data.resources as Array<{ name: string }>;
        expect(
          resources.map((r) => r.name),
          combined,
        ).toEqual(["gateway", "queue"]);
      }
      if (name === "connect") {
        expect(JSON.stringify(parseEnvelope(result.stdout).data), combined).toContain(
          join(root, ".mcp.json"),
        );
      }
    }, 30_000);
  }

  it("flisk config verify --json --project /nonexistent writes a machine error envelope", () => {
    const result = runFlisk(["config", "verify", "--json", "--project", "/nonexistent"], {
      cwd: outside(),
    });
    expect(result.status).toBe(1);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.data).toBeNull();
    expect(envelope.errors[0].message).toContain("No Flisk project at /nonexistent");
  });

  it("rejects an explicitly empty --project value", () => {
    for (const args of [
      ["stacks", "--json", "--project", ""],
      ["config", "verify", "--json", "--project", ""],
    ]) {
      const result = runFlisk(args, { cwd: outside() });
      expect(result.status, `${args.join(" ")}: ${result.stdout}${result.stderr}`).toBe(1);
      const envelope = parseEnvelope(result.stdout);
      expect(envelope.data).toBeNull();
      expect(envelope.errors[0].message).toContain("Missing value for --project");
    }
  });

  it("connect --global --project is rejected by connect's own validation", () => {
    const root = project();
    const result = runFlisk(
      ["connect", "claude", "--global", "--project", root, "--dry-run", "--json"],
      { cwd: outside() },
    );
    expect(result.status).toBe(2);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.errors[0].message).toBe("Choose one of --project and --global");
  });

  it("connect rejects an invalid --project with its own exit-2 error", () => {
    const result = runFlisk(
      ["connect", "claude", "--project", "/nonexistent", "--dry-run", "--json"],
      { cwd: outside() },
    );
    expect(result.status).toBe(2);
    const envelope = parseEnvelope(result.stdout);
    expect(envelope.errors[0].message).toContain("No Flisk project at /nonexistent");
  });

  it("rewrites a relative --project to the absolute path for the detached up child", () => {
    const cwd = realpath(outside());
    const root = realpath(project());
    const rel = relative(cwd, root);
    const expected = join(cwd, rel);
    expect(absoluteProjectArgs(["up", "--project", rel, "--wait"], cwd)).toEqual([
      "up",
      "--project",
      expected,
      "--wait",
    ]);
    expect(absoluteProjectArgs(["up", `--project=${rel}`, "--wait"], cwd)).toEqual([
      "up",
      `--project=${expected}`,
      "--wait",
    ]);
  });

  it("flisk up --wait --project <relative path> targets the fixture project", () => {
    const root = project();
    const cwd = outside();
    const rel = relative(cwd, root);
    // Isolate PATH so CI runners with Tilt/Docker installed fail fast after project resolution
    // rather than launching real containers and leaving orphan processes.
    const result = runFlisk(["up", "--wait", "--project", rel, "--json"], {
      cwd,
      env: { PATH: outside(), FLISK_UP_WAIT_TIMEOUT: "1" },
      timeout: 20_000,
    });
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).not.toContain("No Flisk project at");
    expect(combined).not.toContain("Could not find project root");
    expect(combined).not.toContain("No such file or directory");
  }, 30_000);

  it("flisk up --wait --project ./nested/app resolves against caller cwd rather than post-chdir root", () => {
    const parent = outside();
    const nestedRoot = join(parent, "nested", "app");
    mkdirSync(join(nestedRoot, ".flisk"), { recursive: true });
    mkdirSync(join(nestedRoot, "services", "app", "gateway"), { recursive: true });
    writeFileSync(
      join(nestedRoot, ".flisk", "project.json"),
      `${JSON.stringify({
        version: "1.0",
        project: { name: "nested-parity-fixture", version: "1.0.0" },
        phases: {
          pre_alpha: { name: "Pre-Alpha", description: "", enabledStacks: ["app"] },
          alpha: { name: "Alpha", description: "", enabledStacks: [] },
          beta: { name: "Beta", description: "", enabledStacks: [] },
          out_of_scope: { name: "Out of Scope", description: "", enabledStacks: [] },
        },
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/*/*"] },
      })}\n`,
    );
    writeFileSync(
      join(nestedRoot, "services", "app", "gateway", "service.json"),
      `${JSON.stringify({ appName: "gateway", stack: "app", appType: "backend", port: 3100 })}\n`,
    );
    const result = runFlisk(["up", "--wait", "--project", "./nested/app", "--json"], {
      cwd: parent,
      env: { PATH: outside(), FLISK_UP_WAIT_TIMEOUT: "1" },
      timeout: 20_000,
    });
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).not.toContain("No Flisk project at");
    expect(combined).not.toContain("Could not find project root");
    expect(combined).not.toContain("No such file or directory");
  }, 30_000);

  it("connect rejects empty --project '' with exit 2", () => {
    const cwd = outside();
    const result = runFlisk(["connect", "claude", "--project", ""], { cwd });
    expect(result.status).toBe(2);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Missing value for --project <path>");
  });

  it("lists --project <path> in every affected help", () => {
    const cwd = outside();
    for (const { name, args } of cases) {
      const command = args[0] as string;
      const result = runFlisk([command, "--help"], { cwd, env: { NO_COLOR: "1" } });
      const text = `${result.stdout}\n${result.stderr}`;
      const flag = name === "connect" ? "--project [path]" : "--project <path>";
      expect(text, `${name} help`).toContain(flag);
    }
  });
});
