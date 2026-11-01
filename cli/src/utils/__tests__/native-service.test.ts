// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTempProject, makeResource } from "../../test-support/index.js";
import { projectNeedsBun } from "../bun-requirement.js";
import {
  commandProgram,
  declaresCommand,
  isNativeProject,
  resolveRuntimeMode,
  validateNativeServiceFields,
} from "../native-service.js";
import { validateServiceManifest } from "../service-manifest.js";
import { discoverResourcesWithProblems } from "../services.js";

const nativeResource = (name: string, config: Record<string, unknown> = {}) =>
  makeResource(name, "bring-your-own", { command: "node server.js", ...config });

describe("minimal service contract: declaring a command", () => {
  it("treats only a non-empty top-level command as a local process", () => {
    expect(declaresCommand({ command: "node server.js" })).toBe(true);
    expect(declaresCommand({ command: "  " })).toBe(false);
    expect(declaresCommand({ command: 1 })).toBe(false);
    // dev.command is the dev command inside a generated container (the Python example), not a native service.
    expect(declaresCommand({ dev: { command: "uvicorn main:app" } })).toBe(false);
  });

  it("rejects a second runtime source and names the service", () => {
    expect(
      validateNativeServiceFields({ appName: "api", command: "node server.js", image: "nginx" }),
    ).toEqual([expect.stringMatching(/^service "api": declares both command and image/)]);
    expect(
      validateNativeServiceFields({
        appName: "web",
        command: "npm start",
        image: "nginx",
        dockerfile: "Dockerfile",
      }),
    ).toEqual([
      expect.stringMatching(/^service "web": declares both command and image and dockerfile/),
    ]);
  });

  it("leaves a container service, including image plus dockerfile, to the existing contract", () => {
    expect(validateNativeServiceFields({ appName: "db", image: "postgres:17" })).toEqual([]);
    expect(
      validateNativeServiceFields({ appName: "app", image: "app:dev", dockerfile: "Dockerfile" }),
    ).toEqual([]);
  });

  it("requires env to map variable names to strings", () => {
    expect(validateNativeServiceFields({ appName: "a", command: "x", env: ["A=1"] })).toEqual([
      'service "a": env must be an object of string values',
    ]);
    expect(
      validateNativeServiceFields({
        appName: "a",
        command: "x",
        env: { PORT2: 1, "BAD-NAME": "x" },
      }),
    ).toEqual([expect.stringContaining("env PORT2, BAD-NAME")]);
    expect(
      validateNativeServiceFields({
        appName: "a",
        command: "x",
        env: { API_URL: "http://localhost:4000" },
      }),
    ).toEqual([]);
  });

  it("asks a command service for appName, appType and schemaVersion, not for a stack", () => {
    const minimal = { appName: "api", appType: "backend", command: "node s.js", schemaVersion: 1 };
    expect(validateServiceManifest(minimal, "api/service.json").errors).toEqual([]);
    expect(validateServiceManifest({ command: "node s.js" }, "x/service.json").errors).toEqual([
      "x/service.json.appName: required field is missing",
      "x/service.json.appType: required field is missing",
      "x/service.json.schemaVersion: required field is missing",
    ]);
    // A service without command keeps every required field.
    expect(validateServiceManifest({ appName: "api" }, "y/service.json").errors).toEqual([
      "y/service.json.appType: required field is missing",
      "y/service.json.stack: required field is missing",
      "y/service.json.schemaVersion: required field is missing",
    ]);
  });

  it("knows command and env, so flisk up does not warn about unknown fields", () => {
    const result = validateServiceManifest(
      {
        appName: "api",
        appType: "backend",
        command: "node s.js",
        env: { A: "1" },
        schemaVersion: 1,
      },
      "service.json",
    );
    expect(result.warnings).toEqual([]);
  });
});

describe("discovering command services", () => {
  it("discovers a service.json with appName, appType, command and port, and no stack", () => {
    const root = createTempProject({
      files: {
        "api/service.json": JSON.stringify({
          appName: "api",
          appType: "backend",
          command: "node s.js",
          port: 4100,
        }),
      },
    });
    const { resources, problems } = discoverResourcesWithProblems(root);
    expect(problems).toEqual([]);
    expect(resources).toHaveLength(1);
    expect(resources[0]).toMatchObject({
      name: "api",
      port: 4100,
      type: "backend",
      config: { appName: "api", appType: "backend", command: "node s.js" },
    });
  });

  it("refuses a command service without appType instead of guessing one", () => {
    const root = createTempProject({
      files: { "api/service.json": JSON.stringify({ appName: "api", command: "node s.js" }) },
    });
    const { resources, problems } = discoverResourcesWithProblems(root);
    expect(resources).toEqual([]);
    expect(problems).toEqual([
      expect.objectContaining({ reason: "missing required fields (appName and appType)" }),
    ]);
  });

  it("refuses a service.json with two runtime sources, naming the service", () => {
    const root = createTempProject();
    writeFileSync(
      join(root, "service.json"),
      JSON.stringify({
        appName: "api",
        appType: "backend",
        command: "node s.js",
        dockerfile: "Dockerfile",
      }),
    );
    const { resources, problems } = discoverResourcesWithProblems(root);
    expect(resources).toEqual([]);
    expect(problems).toEqual([
      {
        path: join(root, "service.json"),
        reason: expect.stringMatching(/^service "api": declares both command and dockerfile/),
      },
    ]);
  });
});

describe("runtime mode of a selection", () => {
  it("runs natively when every selected service declares command", () => {
    const api = nativeResource("api");
    const web = nativeResource("web");
    expect(resolveRuntimeMode([api, web])).toEqual({ mode: "native", mixed: [] });
    expect(isNativeProject([api, web])).toBe(true);
  });

  it("keeps the container path for a project without command services", () => {
    const api = makeResource("api", "backend");
    expect(resolveRuntimeMode([api])).toEqual({ mode: "container", mixed: [] });
    expect(isNativeProject([api])).toBe(false);
    expect(isNativeProject([])).toBe(false);
  });

  it("reports the native services in the way of a container selection", () => {
    const api = makeResource("api", "backend");
    const web = nativeResource("web");
    expect(resolveRuntimeMode([api, web])).toEqual({ mode: "container", mixed: ["web"] });
    // Tilt discovers every service.json, so a native sibling outside the selection is in the way too.
    expect(resolveRuntimeMode([api], [api, web])).toEqual({ mode: "container", mixed: ["web"] });
  });

  it("runs ready-made image containers next to local processes (a mixed run)", () => {
    const db = makeResource("postgres", "bring-your-own", { image: "postgres:15-alpine" });
    const api = nativeResource("api", { dependsOn: ["postgres"] });
    expect(resolveRuntimeMode([db, api])).toEqual({ mode: "native", mixed: [] });
    expect(isNativeProject([db, api])).toBe(true);
    // Images alone are still the Docker + Tilt path.
    expect(resolveRuntimeMode([db])).toEqual({ mode: "container", mixed: [] });
    expect(isNativeProject([db])).toBe(false);
  });

  it("refuses a service built from a Dockerfile next to a local process", () => {
    const built = makeResource("worker", "bring-your-own", { dockerfile: "Dockerfile" });
    const api = nativeResource("api");
    expect(resolveRuntimeMode([built, api])).toEqual({ mode: "container", mixed: ["api"] });
    expect(isNativeProject([built, api])).toBe(false);
  });
});

describe("programs a command starts", () => {
  it("finds the program after environment assignments", () => {
    expect(commandProgram("node server.js")).toBe("node");
    expect(commandProgram("PORT=1 DEBUG=x bun run dev")).toBe("bun");
    expect(commandProgram("env FOO=1 python3 -m http.server")).toBe("python3");
    expect(commandProgram("./bin/api --port 1")).toBe("./bin/api");
    expect(commandProgram("$(which node) a.js")).toBeNull();
  });
});

describe("Bun requirement", () => {
  it("does not ask for Bun when every API service declares a command", () => {
    expect(projectNeedsBun([nativeResource("api", { appType: "backend" })])).toBe(false);
    expect(projectNeedsBun([makeResource("api", "backend")])).toBe(true);
  });
});
