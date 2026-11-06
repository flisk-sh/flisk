// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync,
}));

import { healthProbeCannotRun } from "../up-readiness.js";

/** `docker ps` answers with the container id, then `docker inspect` with "<status> <exit codes...>". */
function docker(psOutput: string, inspectOutput: string): void {
  execFileSync.mockImplementation((cmd: string, args?: string[]) => {
    if (cmd !== "docker") return "";
    return args?.[0] === "ps" ? psOutput : inspectOutput;
  });
}

describe("healthProbeCannotRun", () => {
  beforeEach(() => execFileSync.mockReset());

  it("is true for a running container whose every probe exited 127 (curl: not found)", () => {
    docker("abc123\n", "running 127 127 127 ");
    expect(healthProbeCannotRun("lychee-facial-recognition")).toBe(true);
  });

  it("is true when the probes exited 126 (not executable) or 127", () => {
    docker("abc123\n", "running 126 127 ");
    expect(healthProbeCannotRun("svc")).toBe(true);
  });

  it("is false when any probe ran and failed (exit 1)", () => {
    docker("abc123\n", "running 127 1 127 ");
    expect(healthProbeCannotRun("svc")).toBe(false);
  });

  it("is false for a container that is not running, or has no probe results yet", () => {
    docker("abc123\n", "exited 127 127 ");
    expect(healthProbeCannotRun("svc")).toBe(false);
    docker("abc123\n", "running ");
    expect(healthProbeCannotRun("svc")).toBe(false);
  });

  it("is false when no container, or more than one, matches the service name", () => {
    docker("\n", "");
    expect(healthProbeCannotRun("svc")).toBe(false);
    docker("a\nb\n", "running 127 ");
    expect(healthProbeCannotRun("svc")).toBe(false);
  });

  it("is false when Docker does not answer", () => {
    execFileSync.mockImplementation((cmd: string) => {
      if (cmd !== "docker") return "";
      throw new Error("Cannot connect to the Docker daemon");
    });
    expect(healthProbeCannotRun("svc")).toBe(false);
  });
});
