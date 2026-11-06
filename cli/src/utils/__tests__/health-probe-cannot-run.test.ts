// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync,
}));

import { healthProbeCannotRun } from "../up-readiness.js";

const OCI =
  'OCI runtime exec failed: exec failed: unable to start container process: exec: "curl": executable file not found in $PATH';

/** `docker ps` answers with the container id, then `docker inspect` with the container's State as JSON. */
function docker(psOutput: string, state: { Status: string; probes: Array<[number, string?]> | null }): void {
  const json = JSON.stringify({
    Status: state.Status,
    Health: { Log: state.probes ? state.probes.map(([ExitCode, Output]) => ({ ExitCode, Output: Output ?? "" })) : null },
  });
  execFileSync.mockImplementation((cmd: string, args?: string[]) => {
    if (cmd !== "docker") return "";
    return args?.[0] === "ps" ? psOutput : json;
  });
}

describe("healthProbeCannotRun", () => {
  beforeEach(() => execFileSync.mockReset());

  it("is true for a running container whose every probe exited 127 (shell form: curl: not found)", () => {
    docker("abc123\n", { Status: "running", probes: [[127], [127], [127]] });
    expect(healthProbeCannotRun("lychee-facial-recognition")).toBe(true);
  });

  it("is true for the exec form Compose writes (`test: [CMD, curl, ...]`): exit -1 with 'OCI runtime exec failed'", () => {
    docker("abc123\n", { Status: "running", probes: [[-1, OCI], [-1, OCI], [-1, OCI]] });
    expect(healthProbeCannotRun("lychee-facial-recognition")).toBe(true);
  });

  it("is true when the probes exited 126 (not executable) or 127", () => {
    docker("abc123\n", { Status: "running", probes: [[126], [127]] });
    expect(healthProbeCannotRun("svc")).toBe(true);
  });

  it("is false when any probe ran and failed (exit 1), even among missing-command probes", () => {
    docker("abc123\n", { Status: "running", probes: [[127], [1, "HTTP 500"], [127]] });
    expect(healthProbeCannotRun("svc")).toBe(false);
  });

  it("is false for a probe that timed out (exit -1 without the OCI exec error)", () => {
    docker("abc123\n", { Status: "running", probes: [[-1, "Health check exceeded timeout (5s)"]] });
    expect(healthProbeCannotRun("svc")).toBe(false);
  });

  it("is false for a container that is not running, or has no probe results yet", () => {
    docker("abc123\n", { Status: "exited", probes: [[127], [127]] });
    expect(healthProbeCannotRun("svc")).toBe(false);
    docker("abc123\n", { Status: "running", probes: [] });
    expect(healthProbeCannotRun("svc")).toBe(false);
    docker("abc123\n", { Status: "running", probes: null });
    expect(healthProbeCannotRun("svc")).toBe(false);
  });

  it("is false when no container, or more than one, matches the service name", () => {
    docker("\n", { Status: "running", probes: [[127]] });
    expect(healthProbeCannotRun("svc")).toBe(false);
    docker("a\nb\n", { Status: "running", probes: [[127]] });
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
