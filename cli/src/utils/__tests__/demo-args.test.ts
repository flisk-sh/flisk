// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { parseDemoRootOptions, projectDestinationError, tiltWatchPorts } from "../demo-args.js";

const argv = (...args: string[]) => ["node", "flisk", ...args];

describe("parseDemoRootOptions", () => {
  it("reads --template in both spellings and the bare form", () => {
    expect(parseDemoRootOptions(argv("--template=demo")).template).toBe("demo");
    expect(parseDemoRootOptions(argv("--template", "demo")).template).toBe("demo");
    expect(parseDemoRootOptions(argv("demo", "--keep")).template).toBe("demo");
    expect(parseDemoRootOptions(argv("demo", "--keep")).keep).toBe(true);
  });

  it("ignores --template after a subcommand or after --", () => {
    expect(parseDemoRootOptions(argv("run", "x", "--", "tool", "--template=demo")).template).toBe(
      undefined,
    );
    expect(parseDemoRootOptions(argv("up", "--template", "demo")).template).toBe(undefined);
    expect(parseDemoRootOptions(argv("--verbose", "--", "--template=demo")).template).toBe(
      undefined,
    );
  });

  it("does not read --project, --keep or --help after a subcommand", () => {
    const options = parseDemoRootOptions(argv("down", "--project", "x", "--keep", "--help"));
    expect(options.project).toBeUndefined();
    expect(options).toMatchObject({ keep: false, help: false });
  });

  it("sees --help next to a root template", () => {
    expect(parseDemoRootOptions(argv("--template=demo", "--help")).help).toBe(true);
    expect(parseDemoRootOptions(argv("demo", "-h")).help).toBe(true);
  });

  it("rejects a malformed --project", () => {
    expect(parseDemoRootOptions(argv("demo", "--project")).projectError).toBeDefined();
    expect(parseDemoRootOptions(argv("demo", "--project", "--keep")).projectError).toBeDefined();
    expect(parseDemoRootOptions(argv("demo", "--project=")).projectError).toBeDefined();
    expect(parseDemoRootOptions(argv("demo", "--project=my-stack")).projectError).toBeUndefined();
    expect(parseDemoRootOptions(argv("demo", "--project", "out")).project).toBe("out");
  });
});

describe("projectDestinationError", () => {
  it("accepts a plain directory and refuses empty, option-like and NUL values", () => {
    expect(projectDestinationError("my-stack")).toBeUndefined();
    expect(projectDestinationError("../elsewhere/my-stack")).toBeUndefined();
    expect(projectDestinationError("")).toBeDefined();
    expect(projectDestinationError("  ")).toBeDefined();
    expect(projectDestinationError("-rf")).toBeDefined();
    expect(projectDestinationError("a\0b")).toBeDefined();
  });
});

describe("tiltWatchPorts", () => {
  it("puts the configured and the saved port ahead of the default range", () => {
    const ports = tiltWatchPorts(10362, { TILT_PORT: "10377" });
    expect(ports.slice(0, 2)).toEqual([10377, 10362]);
    expect(ports).toContain(10350);
    expect(new Set(ports).size).toBe(ports.length);
  });

  it("falls back to the default range", () => {
    expect(tiltWatchPorts(null, {})).toEqual(Array.from({ length: 10 }, (_, i) => 10350 + i));
    expect(tiltWatchPorts(undefined, { TILT_PORT: "nope" })[0]).toBe(10350);
  });
});
