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
