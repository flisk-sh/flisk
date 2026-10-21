// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureExit, makeResource } from "../doubles.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("makeResource", () => {
  it("builds an in-memory resource with appName and appType in its config", () => {
    expect(makeResource("orders-api", "backend", { port: 3100 })).toEqual({
      name: "orders-api",
      path: "/tmp/orders-api",
      configPath: "/tmp/orders-api/service.json",
      config: { appName: "orders-api", appType: "backend", port: 3100 },
    });
  });

  it("defaults the extra config to empty", () => {
    expect(makeResource("worker", "worker").config).toEqual({
      appName: "worker",
      appType: "worker",
    });
  });
});

describe("captureExit", () => {
  it("throws process.exit when the code calls it, and records the code", () => {
    const { exit, expectExit } = captureExit();
    expect(() => process.exit(3)).toThrow("process.exit");
    expectExit(3);
    expect(exit).toHaveBeenCalledWith(3);
  });

  it("fails expectExit when the code exited with a different value", () => {
    const { expectExit } = captureExit();
    expect(() => process.exit(0)).toThrow("process.exit");
    expect(() => expectExit(1)).toThrow();
  });

  it("fails expectExit when the code never exited", () => {
    const { expectExit } = captureExit();
    expect(() => expectExit(0)).toThrow();
  });
});
