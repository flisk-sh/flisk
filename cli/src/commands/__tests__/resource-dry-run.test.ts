// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempProject, parseEnvelope, runFlisk } from "../../test-support/index.js";

/** Include empty directories and mtimes: a preview must not even rewrite an existing file unchanged. */
function snapshot(root: string, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = join(root, path);
    if (entry.isDirectory()) {
      result[`${path}/`] = String(statSync(absolute).mtimeMs);
      Object.assign(result, snapshot(root, path));
    } else {
      result[path] = `${statSync(absolute).mtimeMs}:${readFileSync(absolute).toString("base64")}`;
    }
  }
  return result;
}

function runResourceCommand(root: string, args: string[], dryRun = true) {
  const result = runFlisk(
    ["resource", "sample", "--stack", "shop", "--json", ...args, ...(dryRun ? ["--dry-run"] : [])],
    { cwd: root, input: "", env: { FLISK_LICENSE_KEY: undefined } },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toMatch(/^\{[^\n]*\}\n$/);
  const envelope = parseEnvelope(result.stdout);
  expect(envelope.errors).toEqual([]);
  return envelope.data;
}

describe("resource scaffolding preview", () => {
  it.each([
    ["backend", []],
    ["Express backend", ["--framework", "express"]],
    ["React frontend", ["--type", "frontend"]],
    ["Next frontend", ["--type", "frontend", "--framework", "next"]],
    ["local Vue frontend", ["--type", "frontend", "--framework", "vue", "--local"]],
    ["local backend", ["--local"]],
    ["worker", ["--type", "worker"]],
    ["MCP", ["--type", "mcp"]],
    ["agent", ["--type", "agent", "--durability", "postgres"]],
    ["Python backend", ["--language", "python"]],
    ["Go backend", ["--language", "go"]],
    ["Rust backend", ["--language", "rust"]],
    ["Node backend", ["--language", "node"]],
    ["shared Postgres", ["--type", "database"]],
    ["Redis", ["--type", "database", "--framework", "redis"]],
    ["queue", ["--type", "queue"]],
    ["inference", ["--type", "inference"]],
    ["BYO image", ["--type", "bring-your-own", "--image", "nginx:alpine"]],
    ["BYO nested Dockerfile", ["--type", "bring-your-own", "--dockerfile", "docker/Dockerfile"]],
    ["Prisma and migrator", ["--feature", "prisma"]],
    ["Drizzle", ["--feature", "drizzle"]],
    ["custom path", ["--path", "custom/service"]],
  ] as [string, string[]][])(
    "previews exactly the files created for %s without changing the project",
    (_label, args) => {
      const root = createTempProject();
      const before = snapshot(root);
      const preview = runResourceCommand(root, args);
      expect(preview.dryRun).toBe(true);
      expect(snapshot(root)).toEqual(before);
      expect(preview.files.length).toBeGreaterThan(0);
      expect(preview.files.every((file: { action: string }) => file.action === "create")).toBe(
        true,
      );

      // Repeating the preview must not consume a port or change the plan.
      expect(runResourceCommand(root, args)).toEqual(preview);
      expect(snapshot(root)).toEqual(before);
      const applied = runResourceCommand(root, args, false);
      expect(applied).toEqual(preview.resource);
      const added = Object.keys(snapshot(root)).filter(
        (path) => !(path in before) && !path.endsWith("/"),
      );
      expect(added.sort()).toEqual(preview.files.map((file: { path: string }) => file.path).sort());
      for (const directory of preview.directories) {
        expect(statSync(join(root, directory)).isDirectory()).toBe(true);
      }
    },
  );

  it("prints a readable preview with --yes", () => {
    const root = createTempProject();
    const before = snapshot(root);
    const result = runFlisk(
      ["resource", "api", "--stack", "shop", "--framework", "express", "--dry-run", "--yes"],
      { cwd: root, input: "" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Dry run - planned changes:");
    expect(result.stdout).toContain("Framework: express");
    expect(result.stdout).toContain("create  services/shop/api/service.json");
    expect(result.stdout).toContain("No files were written or ports reserved.");
    expect(result.stdout).not.toContain("created successfully");
    expect(snapshot(root)).toEqual(before);
  });

  it.each(["backend", "sdk"])(
    "previews registration of an existing %s without overwriting its manifest",
    (type) => {
      const root = createTempProject({
        files: {
          "existing/service.json": JSON.stringify({
            appName: "sample",
            appType: type,
            stack: "old",
            custom: "keep",
          }),
        },
      });
      const before = snapshot(root);
      const args = ["--type", type, "--path", "existing", "--register-existing"];
      const preview = runResourceCommand(root, args);
      expect(preview.resource.action).toBe("registered");
      expect(preview.files).toEqual([{ path: "existing/service.json", action: "update" }]);
      expect(preview.directories).toEqual([]);
      expect(snapshot(root)).toEqual(before);
      runResourceCommand(root, args, false);
      expect(JSON.parse(readFileSync(join(root, "existing/service.json"), "utf8"))).toMatchObject({
        stack: "shop",
        custom: "keep",
      });
    },
  );

  it("leaves existing BYO Dockerfiles and instructions out of the write plan", () => {
    const root = createTempProject({
      files: { "custom/Dockerfile": "FROM scratch\n", "custom/AGENTS.md": "User instructions\n" },
    });
    const before = snapshot(root);
    const preview = runResourceCommand(root, ["--type", "bring-your-own", "--path", "custom"]);
    expect(preview.files).toEqual([{ path: "custom/service.json", action: "create" }]);
    expect(snapshot(root)).toEqual(before);
  });

  it.each([
    "service.json",
    "./service.json",
    "nested/../service.json",
    "SERVICE.JSON",
    "AGENTS.md",
    "health.conf",
    "docker/health.conf",
    "service.json/Dockerfile",
    "AGENTS.md/Dockerfile",
  ])("rejects colliding Dockerfile path %s before previewing or writing", (dockerfile) => {
    for (const flags of [["--dry-run"], []]) {
      const root = createTempProject();
      const before = snapshot(root);
      const result = runFlisk(
        [
          "resource",
          "sample",
          "--type",
          "bring-your-own",
          "--stack",
          "shop",
          "--dockerfile",
          dockerfile,
          "--json",
          ...flags,
        ],
        { cwd: root, input: "" },
      );
      expect(result.status, `${dockerfile}: ${result.stdout}`).toBe(1);
      expect(parseEnvelope(result.stdout).errors[0].message).toMatch(
        /reserved|multiple writes|both a file and a directory/i,
      );
      expect(snapshot(root)).toEqual(before);
    }
  });

  it.each(["backend", "bring-your-own"])(
    "rejects a file ancestor for %s without partial writes",
    (type) => {
      for (const flags of [["--dry-run"], []]) {
        const root = createTempProject({ files: { "README.md": "keep this file\n" } });
        const before = snapshot(root);
        const result = runFlisk(
          [
            "resource",
            "sample",
            "--type",
            type,
            "--path",
            "README.md/nested/api",
            "--stack",
            "shop",
            "--json",
            ...flags,
          ],
          { cwd: root, input: "" },
        );
        expect(result.status, result.stdout).toBe(1);
        expect(parseEnvelope(result.stdout).errors[0].message).toContain("not a directory");
        expect(snapshot(root)).toEqual(before);
      }
    },
  );

  it.each([
    {
      manifest: { appType: "backend", language: "python" },
      args: [],
      expected: { type: "backend", language: "python", framework: null },
    },
    {
      manifest: { appType: "backend", language: "python" },
      args: ["--language", "bun", "--framework", "express"],
      expected: { type: "backend", language: "python", framework: null },
    },
    {
      manifest: { appType: "backend", framework: "express" },
      args: [],
      expected: { type: "backend", language: "bun", framework: "express" },
    },
    {
      manifest: { appType: "backend" },
      args: [],
      expected: { type: "backend", language: "bun", framework: "hono" },
    },
    {
      manifest: { appType: "frontend", framework: "vue" },
      args: [],
      expected: { type: "frontend", language: null, framework: "vue" },
    },
    {
      manifest: { appType: "worker" },
      args: [],
      expected: { type: "worker", language: null, framework: null },
    },
  ])("reports the preserved runtime when registering $manifest", ({ manifest, args, expected }) => {
    const root = createTempProject({
      files: {
        "existing/service.json": JSON.stringify({ appName: "sample", stack: "old", ...manifest }),
      },
    });
    const before = snapshot(root);
    const preview = runResourceCommand(root, ["--path", "existing", ...args]);
    expect(preview.resource).toMatchObject(expected);
    expect(snapshot(root)).toEqual(before);
    const applied = runResourceCommand(root, ["--path", "existing", ...args], false);
    expect(applied).toEqual(preview.resource);
    expect(JSON.parse(readFileSync(join(root, "existing/service.json"), "utf8"))).toMatchObject(
      manifest,
    );
  });

  it("prints the existing runtime in the human registration preview", () => {
    const root = createTempProject({
      files: {
        "existing/service.json": JSON.stringify({
          appName: "sample",
          appType: "backend",
          language: "python",
        }),
      },
    });
    const result = runFlisk(
      ["resource", "sample", "--path", "existing", "--stack", "shop", "--dry-run", "--yes"],
      { cwd: root, input: "" },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Language: python");
    expect(result.stdout).toContain("Framework: N/A");
  });

  it("does not refresh stale generated configs", () => {
    const root = createTempProject({
      projectJson: {
        version: "1.0",
        project: { name: "preview", version: "1.0.0" },
        phases: Object.fromEntries(
          ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
            name,
            { name, description: "", enabledStacks: [] },
          ]),
        ),
        optional_infra: {
          monitoring: false,
          elk: false,
          debezium: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/*/*"] },
      },
      generated: { "spec.master": "# deliberately stale\n", Tiltfile: "# keep\n" },
    });
    const before = snapshot(root);
    runResourceCommand(root, ["--type", "database"]);
    expect(snapshot(root)).toEqual(before);
    runResourceCommand(root, ["--type", "database"], false);
    expect(readFileSync(join(root, ".flisk/.flisk-out/spec.master"), "utf8")).not.toBe(
      "# deliberately stale\n",
    );
  });

  it("rejects an invalid resource name without creating directories", () => {
    const root = createTempProject();
    const before = snapshot(root);
    const result = runFlisk(["resource", "Not-valid", "--stack", "shop", "--dry-run", "--json"], {
      cwd: root,
      input: "",
    });
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout).errors[0].message).toContain("Resource name");
    expect(snapshot(root)).toEqual(before);
  });

  it.each([
    ["--port", "70000"],
    ["--framework", "unknown-framework"],
    ["--path", "../outside"],
    ["--type", "bring-your-own", "--dockerfile", "../Dockerfile"],
    ["--local", "--feature", "prisma"],
    ["--type", "sdk"],
  ])("validates rejected options before any writes: %j", (...args) => {
    const root = createTempProject();
    const before = snapshot(root);
    const result = runFlisk(
      ["resource", "sample", "--stack", "shop", "--dry-run", "--json", ...args],
      { cwd: root, input: "" },
    );
    expect(result.status).toBe(1);
    expect(parseEnvelope(result.stdout).errors.length).toBeGreaterThan(0);
    expect(snapshot(root)).toEqual(before);
  });

  it("leaves the proposed local port available for another process", async () => {
    const root = createTempProject();
    const preview = runResourceCommand(root, ["--local"]);
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(preview.resource.port, "127.0.0.1", resolve);
    });
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
});
