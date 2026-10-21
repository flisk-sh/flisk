// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import {
  findFrontendUrl,
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
      unref: () => unknown;
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
      unref: () => unknown;
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

describe("nextAvailableProjectDir", () => {
  it("keeps the name when the folder is free", () => {
    expect(nextAvailableProjectDir("stack", () => false)).toBe("stack");
  });

  it("counts up when the folder is taken", () => {
    const taken = new Set(["stack", "stack-2"]);
    expect(nextAvailableProjectDir("stack", (candidate) => taken.has(candidate))).toBe("stack-3");
  });
});
