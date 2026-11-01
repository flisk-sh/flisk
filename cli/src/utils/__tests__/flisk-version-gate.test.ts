// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enforceFliskVersionGate } from "../flisk-version-gate.js";

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "flisk-version-gate-"));
  mkdirSync(join(projectRoot, ".flisk"), { recursive: true });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeProject(config: object): void {
  writeFileSync(join(projectRoot, ".flisk", "project.json"), JSON.stringify(config));
}

function createExit() {
  return vi.fn((code: number) => {
    throw new Error(`exit ${code}`);
  }) as unknown as (code: number) => never;
}

describe("enforceFliskVersionGate", () => {
  it("continues when the project has no version requirements", () => {
    writeProject({});
    const exit = createExit();

    enforceFliskVersionGate(projectRoot, {}, "1.3.80", exit);

    expect(exit).not.toHaveBeenCalled();
  });

  it.each(["1.3.79", "1.3.81"])(
    "rejects a CLI version that does not match the pin: %s",
    (currentVersion) => {
      writeProject({ pinnedFliskVersion: "1.3.80" });

      const exit = createExit();
      const onFail = vi.fn();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => enforceFliskVersionGate(projectRoot, { onFail }, currentVersion, exit)).toThrow(
        "exit 1",
      );

      expect(exit).toHaveBeenCalledWith(1);
      expect(onFail).toHaveBeenCalledWith(
        expect.stringContaining("npm install -g @flisk-sh/flisk@1.3.80"),
        "mismatch",
      );
      expect(error).toHaveBeenCalledWith(expect.stringContaining("pinnedFliskVersion 1.3.80"));
    },
  );

  it("rejects malformed pin configuration", () => {
    writeProject({ pinnedFliskVersion: "latest" });

    const exit = createExit();
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => enforceFliskVersionGate(projectRoot, {}, "1.3.80", exit)).toThrow("exit 1");
  });

  it("--ignore-version warns and continues without evaluating the mismatch", () => {
    writeProject({ pinnedFliskVersion: "9.9.9" });

    const exit = createExit();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    enforceFliskVersionGate(projectRoot, { ignoreVersion: true }, "1.3.80", exit);

    expect(warning).toHaveBeenCalledWith(expect.stringContaining("--ignore-version"));
    expect(error).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("prints the legacy deprecation warning when the version check passes", () => {
    writeProject({ minTdkVersion: "1.3.80" });

    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const exit = createExit();

    enforceFliskVersionGate(projectRoot, {}, "1.3.80", exit);

    expect(warning).toHaveBeenCalledWith(expect.stringContaining("minTdkVersion is deprecated"));
    expect(exit).not.toHaveBeenCalled();
  });
});
