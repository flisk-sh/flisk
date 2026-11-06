// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync,
}));

import { dockerModelRunnerState } from "../service-config-checks.js";

/** Makes the named `docker` subcommands fail (the way a missing plugin or a stopped runner does) and the rest succeed. */
function dockerFailing(...failing: string[]): void {
  execFileSync.mockImplementation((cmd: string, args?: string[]) => {
    if (cmd !== "docker") return "";
    const sub = args?.slice(0, 2).join(" ") ?? "";
    for (const name of failing) {
      if (sub.startsWith(name)) throw new Error(`docker ${name} failed`);
    }
    return "";
  });
}

describe("dockerModelRunnerState", () => {
  beforeEach(() => execFileSync.mockReset());

  it("is running when `docker model status` succeeds", () => {
    dockerFailing();
    expect(dockerModelRunnerState()).toBe("running");
  });

  it("is backend-not-running when the plugin answers but `docker model status` fails", () => {
    dockerFailing("model status");
    expect(dockerModelRunnerState()).toBe("backend-not-running");
  });

  it("is no-plugin when `docker model version` fails", () => {
    dockerFailing("model version");
    expect(dockerModelRunnerState()).toBe("no-plugin");
  });

  it("is null, never a finding, when Docker itself does not answer (including a timeout)", () => {
    dockerFailing("version");
    expect(dockerModelRunnerState()).toBeNull();
    execFileSync.mockImplementation((cmd: string) => {
      if (cmd !== "docker") return "";
      throw Object.assign(new Error("spawnSync docker ETIMEDOUT"), { code: "ETIMEDOUT" });
    });
    expect(dockerModelRunnerState()).toBeNull();
  });

  it("asks with a timeout and never inherits stdio", () => {
    dockerFailing();
    dockerModelRunnerState();
    for (const call of execFileSync.mock.calls) {
      expect(call[2]).toMatchObject({ timeout: 8000, stdio: ["ignore", "ignore", "ignore"] });
    }
    expect(execFileSync.mock.calls.map((c) => (c[1] as string[]).slice(0, 2).join(" "))).toEqual([
      "version --format",
      "model version",
      "model status",
    ]);
  });
});
