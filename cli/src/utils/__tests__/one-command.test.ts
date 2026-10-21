// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { findFrontendUrl, runStack } from "../one-command.js";

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

describe("runStack", () => {
  it("runs the up command in the project directory and returns its output", async () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
    };
    child.stdout = new EventEmitter();
    const spawnFn = vi.fn(() => child) as never;

    const promise = runStack("/bin/flisk", "/tmp/project", {}, spawnFn);
    child.stdout.emit(
      "data",
      "🌍 Frontend URLs:\n  - storefront: http://storefront.localhost:8080/\n",
    );
    child.emit("close", 0);

    const result = await promise;
    expect(spawnFn).toHaveBeenCalledWith(
      process.execPath,
      ["/bin/flisk", "up"],
      expect.objectContaining({ cwd: "/tmp/project" }),
    );
    expect(result.code).toBe(0);
    expect(findFrontendUrl(result.output)).toBe("http://storefront.localhost:8080/");
  });
});
