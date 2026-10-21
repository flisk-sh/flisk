// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { TdkError } from "../../utils/errors.js";
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
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tdk-stack-cli-"));
    tempDirs.push(projectRoot);
    fs.mkdirSync(path.join(projectRoot, ".tdk"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, ".tdk", "project.json"), "{}\n");
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

  function runTdk(projectRoot: string, args: string[], input?: string) {
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

    expect(error).toBeInstanceOf(TdkError);
    expect((error as Error).message).toContain("Could not parse service.json");
    expect((error as Error).message).toContain(configPath);
  });

  it("reports and skips malformed service.json files during discovery", () => {
    const projectRoot = createProject();
    addResource(projectRoot, "api");
    const malformedPath = path.join(projectRoot, "services", "main", "broken", "service.json");
    fs.mkdirSync(path.dirname(malformedPath), { recursive: true });
    fs.writeFileSync(malformedPath, "{");

    const result = runTdk(projectRoot, ["stack", "--list"]);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(0);
    // macOS temp dirs live under /var, a symlink to /private/var; discovery reports the resolved path.
    expect(output).toContain(`skipped ${fs.realpathSync(malformedPath)}: invalid JSON`);
    expect(output).toContain("api");
  });

  it("validates explicit resource names when discovery finds no resources", () => {
    const projectRoot = createProject();

    const result = runTdk(projectRoot, ["stack", "backend", "--resources", "missing", "--yes"]);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(1);
    expect(output).toContain('Resource "missing" not found');
  });

  it("adds comma- and space-separated resources without prompting when --yes is set", () => {
    const projectRoot = createProject();
    const manifests = ["api", "worker", "web"].map((name) => addResource(projectRoot, name));

    const result = runTdk(projectRoot, [
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

    const result = runTdk(projectRoot, ["stack", "backend", "--resources", "missing", "--yes"]);
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

    const result = runTdk(projectRoot, ["stack", "backend", "--resources", "api", "--yes"]);
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

    const result = runTdk(projectRoot, ["stack", "backend", "--resources", "api", "--yes"]);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('already assigned to stack "legacy"');
    expect(JSON.parse(fs.readFileSync(apiManifest, "utf8")).stack).toBe("legacy");
  });

  it("gives a non-interactive hint when resource selection would prompt", () => {
    const projectRoot = createProject();
    const apiManifest = addResource(projectRoot, "api");

    const result = runTdk(projectRoot, ["stack", "backend"]);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(1);
    expect(output).toContain("--resources");
    expect(JSON.parse(fs.readFileSync(apiManifest, "utf8")).stack).toBe("");
  });

  it("requires a stack name for non-interactive assignment", () => {
    const projectRoot = createProject();
    const apiManifest = addResource(projectRoot, "api");

    const result = runTdk(projectRoot, ["stack", "--resources", "api", "--yes"]);

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("stack name");
    expect(JSON.parse(fs.readFileSync(apiManifest, "utf8")).stack).toBe("");
  });

  it("requires --yes before a non-TTY assignment can reach confirmation", () => {
    const projectRoot = createProject();
    const apiManifest = addResource(projectRoot, "api");

    const result = runTdk(projectRoot, ["stack", "backend", "--resources", "api"]);
    const output = result.stdout + result.stderr;

    expect(result.status).toBe(1);
    expect(output).toContain("--yes");
    expect(JSON.parse(fs.readFileSync(apiManifest, "utf8")).stack).toBe("");
  });

  it("keeps --list usable without a TTY", () => {
    const projectRoot = createProject();
    addResource(projectRoot, "api");

    const result = runTdk(projectRoot, ["stack", "--list"]);

    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toContain("api");
  });
});
