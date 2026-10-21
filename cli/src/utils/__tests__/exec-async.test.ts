// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { execAsync, isExecTimeout } from "../exec-async.js";

describe("execAsync", () => {
  it("resolves with the command's stdout", async () => {
    expect(await execAsync("echo hello", 5000)).toBe("hello\n");
  });

  it("rejects with a timeout error when the command hangs", async () => {
    const err = await execAsync("sleep 5", 100).catch((e: unknown) => e);
    expect(isExecTimeout(err)).toBe(true);
  });

  it("does not treat an ordinary failure as a timeout", async () => {
    const err = await execAsync("exit 3", 5000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isExecTimeout(err)).toBe(false);
  });
});

describe("isExecTimeout", () => {
  it("recognises execSync's ETIMEDOUT", () => {
    expect(isExecTimeout(Object.assign(new Error("t"), { code: "ETIMEDOUT" }))).toBe(true);
  });
});
