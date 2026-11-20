// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, makeResource } from "../../test-support/index.js";
import {
  checkNativeCommands,
  checkNativeDependsOn,
  checkNativeRuntime,
  checkNativeServiceHealth,
  checkNativeServiceScripts,
} from "../doctor-native.js";

const service = (name: string, config: Record<string, unknown> = {}) =>
  makeResource(name, "bring-your-own", { command: "node server.js", ...config });

describe("doctor checks for a project of local processes", () => {
  it("says Docker, Compose and Tilt are not needed", () => {
    expect(checkNativeRuntime([service("api"), service("web")])).toEqual({
      name: "Runtime",
      didPass: true,
      message:
        "Local processes: 2 services declare a command, so Docker, Compose and Tilt are not needed",
    });
  });

  it("fails when a command starts a program that is not installed", () => {
    const result = checkNativeCommands(
      [service("api"), service("ml", { command: "uv run main.py" })],
      (program) => (program === "node" ? "/usr/bin/node" : null),
    );
    expect(result).toMatchObject({ name: "Service commands", didPass: false });
    expect(result.message).toContain("ml: uv");
    expect(result.message).not.toContain("api");
  });

  it("fails a dependsOn that is not a service of the project", () => {
    const result = checkNativeDependsOn([
      service("api", { dependsOn: ["postgres"] }),
      service("web", { dependsOn: ["api"] }),
    ]);
    expect(result).toMatchObject({ name: "Service dependencies", didPass: false });
    expect(result.message).toBe('api dependsOn "postgres", which is not a service of this project');
  });

  it("skips the health check when nothing runs", async () => {
    expect(await checkNativeServiceHealth(createTempDir(), [service("api")], 500)).toMatchObject({
      name: "Service Health",
      didPass: true,
      isSkipped: true,
    });
  });
});

describe("checkNativeServiceScripts", () => {
  const withPkg = (
    scripts: Record<string, string>,
    config: Record<string, unknown> = {},
    name = "worker",
    appType = "worker",
  ) => {
    const dir = createTempDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts }));
    const resource = makeResource(name, appType, { command: "node server.js", ...config });
    resource.path = dir;
    return resource;
  };

  it("fails when a command runs a missing package.json script", () => {
    const result = checkNativeServiceScripts([
      withPkg({ dev: "bun dev", build: "tsc" }, { command: "bun run worker" }, "my-worker"),
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        name: "Service scripts",
        didPass: false,
      }),
    );
    expect(result.message).toContain("my-worker");
    expect(result.message).toContain('"bun run worker"');
    expect(result.message).toContain('no "worker" script');
    expect(result.message).toContain("scripts: dev, build");
    expect(result.fix).toContain("Add the missing script");
  });

  it("passes when the referenced script exists", () => {
    expect(
      checkNativeServiceScripts([
        withPkg({ worker: "bun src/worker.ts" }, { command: "bun run worker" }),
      ]),
    ).toEqual({
      name: "Service scripts",
      didPass: true,
      message: "Every service command script exists in package.json",
    });
  });

  it("passes for non-script commands", () => {
    expect(
      checkNativeServiceScripts([withPkg({ dev: "x" }, { command: "python app.py" })]).didPass,
    ).toBe(true);
  });

  it("skips when there is no package.json", () => {
    const dir = createTempDir();
    const resource = makeResource("api", "backend", { command: "bun run dev" });
    resource.path = dir;
    expect(checkNativeServiceScripts([resource]).didPass).toBe(true);
  });

  it("skips bring-your-own services", () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: {} }));
    const resource = makeResource("byo", "bring-your-own", { command: "bun run missing" });
    resource.path = dir;
    expect(checkNativeServiceScripts([resource]).didPass).toBe(true);
  });

  it("checks dev.command too", () => {
    const result = checkNativeServiceScripts([
      withPkg(
        { dev: "bun dev" },
        { command: "node server.js", dev: { command: "npm run watch" } },
      ),
    ]);
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("npm run watch");
    expect(result.message).toContain('no "watch" script');
  });

  it("covers npm run, pnpm run, yarn run, yarn script, and bun script names", () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { start: "node ." } }));
    for (const command of ["npm run worker", "pnpm run worker", "yarn run worker", "yarn worker", "bun worker"]) {
      const resource = makeResource("svc", "backend", { command });
      resource.path = dir;
      const result = checkNativeServiceScripts([resource]);
      expect(result.didPass, command).toBe(false);
      expect(result.message, command).toContain(`"${command}"`);
    }
  });

  it("does not flag bun/yarn file paths, builtins, or non-script commands", () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
    for (const command of [
      "bun src/index.ts",
      "bun test",
      "bun install",
      "bun run test",
      "yarn install",
      "python app.py",
    ]) {
      const resource = makeResource("svc", "backend", { command });
      resource.path = dir;
      expect(checkNativeServiceScripts([resource]).didPass, command).toBe(true);
    }
  });
});
