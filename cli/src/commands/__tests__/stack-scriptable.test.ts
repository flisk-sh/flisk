// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FliskError } from "../../utils/errors.js";
import { parseStackResourceConfig } from "../stack.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const cliBin = path.join(repoRoot, "cli", "bin", "flisk.js");

describe("flisk stack command scriptability", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function createProject(): string {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flisk-stack-cli-"));
    tempDirs.push(projectRoot);
    fs.mkdirSync(path.join(projectRoot, ".flisk"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, ".flisk", "project.json"), "{}\n");
    return projectRoot;
  }

  function addResource(projectRoot: string, name: string, stack = "", group = "main"): string {
    const resourceDir = path.join(projectRoot, "services", group, name);
    fs.mkdirSync(resourceDir, { recursive: true });
    const manifestPath = path.join(resourceDir, "service.json");
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          appName: name,
          appType: "backend",
          runtime: "bun",
          stack,
          port: 4100,
        },
        null,
        2,
      ),
    );
    return manifestPath;
  }

  function runFlisk(projectRoot: string, args: string[], input?: string) {
    return spawnSync(process.execPath, [cliBin, ...args], {
      cwd: projectRoot,
      input,
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, NO_COLOR: "1" },
    });
  }

  it("includes the service.json path in malformed JSON errors", () => {
    const configPath = path.join("services", "main", "api", "service.json");
    let error: unknown;

    try {
      parseStackResourceConfig("{", configPath);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(FliskError);
    expect((error as Error).message).toContain("Could not parse service.json");
    expect((error as Error).message).toContain(configPath);
  });

  it("reports and skips malformed service.json files during discovery", () => {
    const projectRoot = createProject();
    addResource(projectRoot, "api");
    const malformedPath = path.join(projectRoot, "services", "main", "broken", "service.json");
    fs.mkdirSync(path.dirname(malformedPath), { recursive: true });
    fs.writeFileSync(malformedPath, "{");

    const result = runFlisk(projectRoot, ["stack", "--list"]);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(0);
    // macOS temp dirs live under /var, a symlink to /private/var; discovery reports the resolved path.
    expect(output).toContain(`skipped ${fs.realpathSync(malformedPath)}: invalid JSON`);
    expect(output).toContain("api");
  });

  it("validates explicit resource names when discovery finds no resources", () => {
    const projectRoot = createProject();

    const result = runFlisk(projectRoot, ["stack", "backend", "--resources", "missing", "--yes"]);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(1);
    expect(output).toContain('Resource "missing" not found');
  });

  it("adds comma- and space-separated resources without prompting when --yes is set", () => {
    const projectRoot = createProject();
    const manifests = ["api", "worker", "web"].map((name) => addResource(projectRoot, name));

    const result = runFlisk(projectRoot, [
      "stack",
      "backend",
      "--resources",
      "api,worker",
      "web",
      "--yes",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toContain("Updated 3 resources.");
    for (const manifestPath of manifests) {
      expect(JSON.parse(fs.readFileSync(manifestPath, "utf8")).stack).toBe("backend");
    }
  });

  it("lists valid resource names when an explicit name is unknown", () => {
    const projectRoot = createProject();
    const apiManifest = addResource(projectRoot, "api");
    addResource(projectRoot, "worker");

    const result = runFlisk(projectRoot, ["stack", "backend", "--resources", "missing", "--yes"]);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(1);
    expect(output).toContain('Resource "missing" not found');
    expect(output).toContain("Valid resources: api, worker");
    expect(JSON.parse(fs.readFileSync(apiManifest, "utf8")).stack).toBe("");
  });

  it("rejects duplicate resource names and reports every manifest path before writing", () => {
    const projectRoot = createProject();
    const firstManifest = addResource(projectRoot, "api");
    const secondManifest = addResource(projectRoot, "api", "", "copied");

    const result = runFlisk(projectRoot, ["stack", "backend", "--resources", "api", "--yes"]);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(1);
    expect(output).toContain("duplicate names");
    expect(output).toContain(firstManifest);
    expect(output).toContain(secondManifest);
    expect(JSON.parse(fs.readFileSync(firstManifest, "utf8")).stack).toBe("");
    expect(JSON.parse(fs.readFileSync(secondManifest, "utf8")).stack).toBe("");
  });

  it("rejects an explicitly selected resource that already belongs to a stack", () => {
    const projectRoot = createProject();
    const apiManifest = addResource(projectRoot, "api", "legacy");

    const result = runFlisk(projectRoot, ["stack", "backend", "--resources", "api", "--yes"]);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('already assigned to stack "legacy"');
    expect(JSON.parse(fs.readFileSync(apiManifest, "utf8")).stack).toBe("legacy");
  });

  it("gives a non-interactive hint when resource selection would prompt", () => {
    const projectRoot = createProject();
    const apiManifest = addResource(projectRoot, "api");

    const result = runFlisk(projectRoot, ["stack", "backend"]);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(1);
    expect(output).toContain("--resources");
    expect(JSON.parse(fs.readFileSync(apiManifest, "utf8")).stack).toBe("");
  });

  it("requires a stack name for non-interactive assignment", () => {
    const projectRoot = createProject();
    const apiManifest = addResource(projectRoot, "api");

    const result = runFlisk(projectRoot, ["stack", "--resources", "api", "--yes"]);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("stack name");
    expect(JSON.parse(fs.readFileSync(apiManifest, "utf8")).stack).toBe("");
  });

  it("requires --yes before a non-TTY assignment can reach confirmation", () => {
    const projectRoot = createProject();
    const apiManifest = addResource(projectRoot, "api");

    const result = runFlisk(projectRoot, ["stack", "backend", "--resources", "api"]);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(1);
    expect(output).toContain("--yes");
    expect(JSON.parse(fs.readFileSync(apiManifest, "utf8")).stack).toBe("");
  });

  it("keeps --list usable without a TTY", () => {
    const projectRoot = createProject();
    addResource(projectRoot, "api");

    const result = runFlisk(projectRoot, ["stack", "--list"]);

    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toContain("api");
  });

  it("moves named resources and reports the resulting stack counts", () => {
    const root = createProject();
    const api = addResource(root, "api", "legacy");
    addResource(root, "worker", "legacy");
    addResource(root, "web", "backend");
    addResource(root, "fresh");
    const result = runFlisk(root, [
      "stack",
      "backend",
      "--move",
      "--resources",
      "api,fresh",
      "web",
      "api",
      "--json",
    ]);
    expect(result.status).toBe(0);
    expect(JSON.parse(fs.readFileSync(api, "utf8")).stack).toBe("backend");
    expect(JSON.parse(result.stdout).data).toMatchObject({
      stacks: [
        { name: "backend", resourceCount: 3 },
        { name: "legacy", resourceCount: 1 },
      ],
      unassigned: [],
      stack: "backend",
      assigned: [{ name: "api" }, { name: "fresh" }, { name: "web" }],
    });
    const listed = runFlisk(root, ["stack", "--list", "--json"]);
    expect(JSON.parse(result.stdout).data.stacks).toEqual(JSON.parse(listed.stdout).data.stacks);
  });

  it("removes assignments without deleting resources or their other settings", () => {
    const root = createProject();
    const api = addResource(root, "api", "legacy");
    const fresh = addResource(root, "fresh");
    const before = JSON.parse(fs.readFileSync(api, "utf8"));
    const result = runFlisk(root, ["stack", "--remove", "--resources", "api,fresh", "--json"]);
    expect(result.status).toBe(0);
    delete before.stack;
    expect(JSON.parse(fs.readFileSync(api, "utf8"))).toEqual(before);
    expect(JSON.parse(fs.readFileSync(fresh, "utf8"))).not.toHaveProperty("stack");
    const data = JSON.parse(result.stdout).data;
    expect(data).toMatchObject({
      stacks: [],
      stack: null,
      assigned: [],
      removed: [{ name: "api" }, { name: "fresh" }],
      unassigned: [{ name: "api" }, { name: "fresh" }],
    });
    const listed = JSON.parse(runFlisk(root, ["stack", "--list", "--json"]).stdout).data;
    expect(data.stacks).toEqual(listed.stacks);
    expect(data.unassigned).toEqual(listed.unassigned);
    const repeated = runFlisk(root, ["stack", "--remove", "--resources", "api", "--yes"]);
    expect(repeated.status).toBe(0);
    expect(repeated.stdout + repeated.stderr).not.toContain("flisk up");
  });

  it.each(["--move", "--remove"])("validates all names before %s writes anything", (flag) => {
    const root = createProject();
    const api = addResource(root, "api", "legacy");
    const args = flag === "--move" ? ["stack", "backend"] : ["stack"];
    const result = runFlisk(root, [...args, flag, "--resources", "api", "missing", "--json"]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).errors[0].message).toContain('Resource "missing" not found');
    expect(JSON.parse(fs.readFileSync(api, "utf8")).stack).toBe("legacy");
  });

  it.each([
    {
      args: ["--move", "--remove", "--resources", "api", "--yes"],
      error: "cannot be used together",
    },
    {
      args: ["--list", "--move", "--resources", "api", "--yes"],
      error: "--list cannot be combined",
    },
    {
      args: ["--list", "--remove", "--resources", "api", "--yes"],
      error: "--list cannot be combined",
    },
    {
      args: ["backend", "--remove", "--resources", "api", "--yes"],
      error: "does not take a stack name",
    },
    { args: ["backend", "--move", "--yes"], error: "require --resources" },
    { args: ["--remove", "--yes"], error: "require --resources" },
    { args: ["--move", "--resources", "api", "--yes"], error: "A stack name is required" },
    { args: ["backend", "--move", "--resources", "api"], error: "Confirmation requires a TTY" },
    { args: ["--remove", "--resources", "api"], error: "Confirmation requires a TTY" },
  ])("rejects invalid or unconfirmed mutation arguments: $args", ({ args, error }) => {
    const root = createProject();
    const api = addResource(root, "api", "legacy");
    const result = runFlisk(root, ["stack", ...args]);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(error);
    expect(JSON.parse(fs.readFileSync(api, "utf8")).stack).toBe("legacy");
  });

  it("moves the last resource to a new stack without leaving an empty old stack in the report", () => {
    const root = createProject();
    addResource(root, "api", "legacy");
    const result = runFlisk(root, ["stack", "new-stack", "--move", "--resources", "api", "--yes"]);
    expect(result.status).toBe(0);
    const listed = runFlisk(root, ["stack", "--list", "--json"]);
    expect(JSON.parse(listed.stdout).data.stacks).toEqual([
      { name: "new-stack", resourceCount: 1 },
    ]);
  });
});
