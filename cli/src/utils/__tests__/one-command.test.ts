// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  defaultRun,
  findFrontendUrl,
  findServiceDirs,
  initializeProject,
  installServiceDependencies,
  nextAvailableProjectDir,
  parseStackEnvelope,
  runStackQuiet,
} from "../one-command.js";

describe("findFrontendUrl", () => {
  it("picks the first frontend URL out of the up output", () => {
    const output = [
      "🌍 Frontend URLs:",
      "  - storefront: http://storefront.localhost:8080/checkout",
      "  - admin: http://admin.localhost:8080/",
      "",
      "🔧 Backend API URLs:",
      "  - api: http://api.localhost:8080/api",
    ].join("\n");
    expect(findFrontendUrl(output)).toBe("http://storefront.localhost:8080/checkout");
  });

  it("returns nothing when the output has no frontend block", () => {
    expect(findFrontendUrl("no urls here")).toBeUndefined();
  });
});

describe("parseStackEnvelope", () => {
  it("reads a ready stack", () => {
    const outcome = parseStackEnvelope(
      '{"schemaVersion":1,"data":{"ok":true,"stack":"shop"},"errors":[]}',
    );
    expect(outcome?.ok).toBe(true);
  });

  it("reads the failure message", () => {
    const outcome = parseStackEnvelope(
      '{"schemaVersion":1,"data":{"ok":false},"errors":[{"code":"UP_FAILED","message":"Docker is not running"}]}',
    );
    expect(outcome?.ok).toBe(false);
    expect(outcome?.error).toBe("Docker is not running");
  });

  it("ignores output that is not the envelope", () => {
    expect(parseStackEnvelope("building images\nnot json\n")).toBeUndefined();
  });
});

describe("runStackQuiet", () => {
  it("starts the stack quietly and reports when it is ready", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      unref: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.unref = () => child;
    const spawnFn = vi.fn(() => child) as never;

    const promise = runStackQuiet("/bin/flisk", "/tmp/project", {}, spawnFn);
    child.stdout.emit("data", "Tilt build logs that nobody wants to read\n");
    child.stdout.emit("data", '{"schemaVersion":1,"data":{"ok":true},"errors":[]}\n');

    const result = await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      process.execPath,
      ["/bin/flisk", "up", "--json"],
      expect.objectContaining({ cwd: "/tmp/project" }),
    );
    expect(result.ok).toBe(true);
  });

  it("reports a stack that never came up", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      unref: () => void;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.unref = () => child;
    const spawnFn = vi.fn(() => child) as never;

    const promise = runStackQuiet("/bin/flisk", "/tmp/project", {}, spawnFn);
    child.stdout.emit(
      "data",
      '{"schemaVersion":1,"data":{"ok":false},"errors":[{"message":"Docker is not running"}]}\n',
    );

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Docker is not running");
  });
});

describe("initializeProject", () => {
  it("sets up the cloned project so the stack can start", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const spawnFn = vi.fn(() => child) as never;

    const promise = initializeProject("/bin/flisk", "/tmp/project", {}, spawnFn);
    child.emit("close", 0);

    const result = await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      process.execPath,
      ["/bin/flisk", "project", "--yes", "--quiet"],
      expect.objectContaining({ cwd: "/tmp/project", stdio: ["ignore", "pipe", "pipe"] }),
    );
    expect(result.ok).toBe(true);
  });

  it("reports the last error line when the setup fails", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const spawnFn = vi.fn(() => child) as never;

    const promise = initializeProject("/bin/flisk", "/tmp/project", {}, spawnFn);
    child.stderr.emit("data", "Could not write .flisk/project.json\n");
    child.emit("close", 1);

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Could not write .flisk/project.json");
  });
});

describe("nextAvailableProjectDir", () => {
  it("keeps the name when the folder is free", () => {
    expect(nextAvailableProjectDir("stack", () => false)).toBe("stack");
  });

  it("counts up when the folder is taken", () => {
    const taken = new Set(["stack", "stack-2"]);
    expect(nextAvailableProjectDir("stack", (candidate) => taken.has(candidate))).toBe("stack-3");
  });
});

describe("findServiceDirs", () => {
  it("finds the folders that have their own package.json", () => {
    const root = mkdtempSync(join(tmpdir(), "flisk-svc-"));
    mkdirSync(join(root, "services", "api"), { recursive: true });
    writeFileSync(join(root, "services", "api", "package.json"), "{}");
    mkdirSync(join(root, "services", "web", "node_modules", "x"), { recursive: true });
    writeFileSync(join(root, "services", "web", "node_modules", "x", "package.json"), "{}");
    const dirs = findServiceDirs(root).map((dir) => dir.slice(root.length));
    expect(dirs).toContain("/services/api");
    expect(dirs.some((dir) => dir.includes("node_modules"))).toBe(false);
  });
});

describe("installServiceDependencies", () => {
  it("executes the installer once per service directory that contains package.json", async () => {
    const root = mkdtempSync(join(tmpdir(), "flisk-install-deps-"));
    const apiDir = join(root, "services", "api");
    const webDir = join(root, "services", "web");
    const docsDir = join(root, "services", "docs");
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(apiDir, "package.json"), "{}");
    mkdirSync(webDir, { recursive: true });
    writeFileSync(join(webDir, "package.json"), "{}");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, "README.md"), "no package.json");
    // Nested node_modules should be ignored by findServiceDirs
    mkdirSync(join(apiDir, "node_modules", "nested"), { recursive: true });
    writeFileSync(join(apiDir, "node_modules", "nested", "package.json"), "{}");

    const run = vi.fn(async () => 0);
    const results = await installServiceDependencies(root, run);

    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledWith("bun", ["install"], apiDir);
    expect(run).toHaveBeenCalledWith("bun", ["install"], webDir);
    expect(results).toEqual([
      { dir: apiDir, ok: true },
      { dir: webDir, ok: true },
    ]);
  });

  it("records failed status when the installer returns a non-zero exit code", async () => {
    const root = mkdtempSync(join(tmpdir(), "flisk-install-fail-"));
    const apiDir = join(root, "services", "api");
    mkdirSync(apiDir, { recursive: true });
    writeFileSync(join(apiDir, "package.json"), "{}");

    const run = vi.fn(async () => 1);
    const results = await installServiceDependencies(root, run);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("bun", ["install"], apiDir);
    expect(results).toEqual([{ dir: apiDir, ok: false }]);
  });

  it("does not invoke the installer when no services have package.json", async () => {
    const root = mkdtempSync(join(tmpdir(), "flisk-install-empty-"));
    mkdirSync(join(root, "services", "docs"), { recursive: true });
    writeFileSync(join(root, "services", "docs", "README.md"), "# Docs");

    const run = vi.fn();
    const results = await installServiceDependencies(root, run);

    expect(run).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });
});

describe("defaultRun", () => {
  it("forwards command, arguments, and cwd to the process runner with stdio ignore", async () => {
    const child = new EventEmitter();
    const spawnFn = vi.fn(() => child) as never;

    const promise = defaultRun("bun", ["install"], "/test/project", spawnFn);
    child.emit("close", 0);

    const code = await promise;
    expect(spawnFn).toHaveBeenCalledWith("bun", ["install"], {
      cwd: "/test/project",
      stdio: "ignore",
    });
    expect(code).toBe(0);
  });

  it("resolves with the exit code when process exits with non-zero", async () => {
    const child = new EventEmitter();
    const spawnFn = vi.fn(() => child) as never;

    const promise = defaultRun("echo", ["hello"], "/test/dir", spawnFn);
    child.emit("close", 2);

    const code = await promise;
    expect(code).toBe(2);
  });

  it("resolves with 1 when process exit code is null", async () => {
    const child = new EventEmitter();
    const spawnFn = vi.fn(() => child) as never;

    const promise = defaultRun("test", [], "/test/dir", spawnFn);
    child.emit("close", null);

    const code = await promise;
    expect(code).toBe(1);
  });

  it("resolves with 1 when the process emits an error event", async () => {
    const child = new EventEmitter();
    const spawnFn = vi.fn(() => child) as never;

    const promise = defaultRun("nonexistent-command", ["arg"], "/test/dir", spawnFn);
    child.emit("error", new Error("spawn ENOENT"));

    const code = await promise;
    expect(code).toBe(1);
  });
});
