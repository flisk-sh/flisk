// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { createTempDir, makeResource } from "../../test-support/index.js";
import {
  checkNativeCommands,
  checkNativeDependsOn,
  checkNativeRuntime,
  checkNativeServiceHealth,
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

  it("passes when a package-manager script starts an installed program", () => {
    const result = checkNativeCommands(
      [makeResource("shop-api", "bring-your-own", { command: "npm run dev" })],
      (program) => (["npm", "node"].includes(program) ? "/usr/bin/tool" : null),
      () => JSON.stringify({ scripts: { dev: "node src/index.js" } }),
    );
    expect(result).toMatchObject({ name: "Service commands", didPass: true });
  });

  it("fails with the service, script and program when a script starts a missing program", () => {
    const result = checkNativeCommands(
      [makeResource("shop-api", "bring-your-own", { command: "npm run dev" })],
      (program) => (program === "npm" ? "/usr/bin/npm" : null),
      () => JSON.stringify({ scripts: { dev: "bun run --watch src/index.ts" } }),
    );
    expect(result.didPass).toBe(false);
    expect(result.message).toContain('shop-api: script "dev" starts bun, which is not installed');
    expect(result.fix).toContain("https://bun.sh/docs/installation");
    expect(result.fix).toContain("package.json");
  });

  it("skips script resolution when the service has no package.json", () => {
    const result = checkNativeCommands(
      [makeResource("shop-api", "bring-your-own", { command: "npm run dev" })],
      (program) => (program === "npm" ? "/usr/bin/npm" : null),
      () => {
        throw new Error("ENOENT: package.json");
      },
    );
    expect(result).toEqual({
      name: "Service commands",
      didPass: true,
      message: "Every service command starts a program that is installed",
    });
  });

  it("checks the first program of each chained part of a script", () => {
    const result = checkNativeCommands(
      [makeResource("shop-api", "bring-your-own", { command: "npm run dev" })],
      (program) => (["npm", "bun"].includes(program) ? "/usr/bin/tool" : null),
      () => JSON.stringify({ scripts: { dev: "prisma generate && bun run src/index.ts" } }),
    );
    expect(result.didPass).toBe(false);
    expect(result.message).toContain(
      'shop-api: script "dev" starts prisma, which is not installed',
    );
    expect(result.message).not.toContain("starts bun");
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
