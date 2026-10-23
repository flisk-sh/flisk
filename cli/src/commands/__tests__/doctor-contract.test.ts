// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { captureExit } from "../../test-support/index.js";
import type { CheckResult } from "../../types/index.js";
import { checkHostPorts } from "../../utils/doctor-runtime.js";
import {
  checkBun,
  checkDockerOperatingSystem,
  checkPublishedBindAddress,
  checkTilt,
  checkWslProjectLocation,
  doctorCommand,
  MIN_BUN_VERSION,
  MIN_TILT_VERSION,
  NATIVE_WINDOWS_DOCTOR_MESSAGE,
  orderDoctorResults,
  versionMeetsMinimum,
} from "../doctor.js";

vi.mock("../../utils/windows-doctor.js", () => ({
  checkWindowsRuntimeTools: vi.fn(() => ({
    name: "Windows Runtime Tools",
    didPass: true,
    message: "Docker and Tilt found on PATH",
  })),
  checkWindowsDockerMode: vi.fn(() => ({
    name: "Docker container mode",
    didPass: true,
    message: "Docker Desktop is using Linux containers",
  })),
  checkWindowsHostConfiguration: vi.fn(async () => ({
    name: "Windows ports and DNS",
    didPass: true,
    message: "Required ports are available and Flisk localhost DNS resolves to loopback",
  })),
}));

describe("doctor environment contract", () => {
  it("requires Tilt 0.25.0 or newer", async () => {
    expect(MIN_TILT_VERSION).toEqual([0, 25, 0]);
    expect(versionMeetsMinimum("v0.24.9", MIN_TILT_VERSION)).toBe(false);
    expect(versionMeetsMinimum("Tilt v0.25.0", MIN_TILT_VERSION)).toBe(true);
    expect(versionMeetsMinimum("v0.37.7", MIN_TILT_VERSION)).toBe(true);

    const old = await checkTilt(async () => "v0.24.9");
    const current = await checkTilt(async () => "v0.25.0");
    expect(old.didPass).toBe(false);
    expect(old.fix).toContain("Tilt v0.25.0 or newer");
    expect(current.didPass).toBe(true);
  });

  it("requires Bun 1.2+ when a project has generated JavaScript services", async () => {
    expect(MIN_BUN_VERSION).toEqual([1, 2, 0]);
    const root = mkdtempSync(join(tmpdir(), "flisk-doctor-bun-floor-"));
    const originalCwd = process.cwd();
    try {
      mkdirSync(join(root, ".tdk"), { recursive: true });
      mkdirSync(join(root, "services", "api"), { recursive: true });
      writeFileSync(
        join(root, ".tdk", "project.json"),
        JSON.stringify({ project: { name: "test" } }),
      );
      writeFileSync(
        join(root, "services", "api", "service.json"),
        JSON.stringify({ appName: "api", appType: "backend", stack: "app", port: 4000 }),
      );
      process.chdir(root);

      const old = await checkBun(async () => "1.1.9");
      const current = await checkBun(async () => "1.2.0");
      expect(old.didPass).toBe(false);
      expect(old.message).toContain("below the required 1.2.0 floor");
      expect(current.didPass).toBe(true);
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips the Bun requirement when the project has no generated JavaScript services", async () => {
    const root = mkdtempSync(join(tmpdir(), "flisk-doctor-no-bun-"));
    const originalCwd = process.cwd();
    try {
      mkdirSync(join(root, ".tdk"), { recursive: true });
      writeFileSync(
        join(root, ".tdk", "project.json"),
        JSON.stringify({ project: { name: "test" } }),
      );
      process.chdir(root);
      const result = await checkBun(async () => {
        throw new Error("Bun should not be checked");
      });
      expect(result.didPass).toBe(true);
      expect(result.isSkipped).toBe(true);
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when Docker uses a non-Linux engine", async () => {
    const result = await checkDockerOperatingSystem(async () => "windows");
    expect(result.didPass).toBe(false);
    expect(result.message).toContain("requires Linux containers");
  });

  it("warns when TDK_BIND_ADDRESS exposes dev ports to the network (GHSA-3hj3-f39v-j2x5)", () => {
    const unset = checkPublishedBindAddress({});
    const loopback = checkPublishedBindAddress({ TDK_BIND_ADDRESS: "127.0.0.1" });
    const lan = checkPublishedBindAddress({ TDK_BIND_ADDRESS: "192.168.1.20" });
    const wildcard = checkPublishedBindAddress({ TDK_BIND_ADDRESS: "0.0.0.0" });
    const wildcardStrict = checkPublishedBindAddress({ TDK_BIND_ADDRESS: "0.0.0.0" }, true);

    expect(unset.didPass).toBe(true);
    expect(unset.message).toContain("127.0.0.1");
    expect(loopback.didPass).toBe(true);
    expect(lan.didPass).toBe(true);
    expect(wildcard.didPass).toBe(true);
    expect(wildcard.isWarning).toBe(true);
    expect(wildcard.message).toContain("reachable from other machines");
    expect(wildcard.fix).toContain("Unset TDK_BIND_ADDRESS");
    expect(wildcardStrict.didPass).toBe(false);
  });

  it("treats every IPv6 unspecified spelling as a wildcard bind", () => {
    for (const address of [
      "::",
      "[::]",
      "0:0:0:0:0:0:0:0",
      "[0:0::0]",
      "::0.0.0.0",
      "[::0.0.0.0]",
    ]) {
      const result = checkPublishedBindAddress({ TDK_BIND_ADDRESS: address }, true);
      expect(result.didPass, address).toBe(false);
    }
    expect(checkPublishedBindAddress({ TDK_BIND_ADDRESS: "::1" }).isWarning).toBeFalsy();
  });

  it("warns about /mnt/c and fails there only in strict WSL mode", () => {
    const warning = checkWslProjectLocation("/mnt/c/Users/dev/tdk", false, true);
    const strict = checkWslProjectLocation("/mnt/c/Users/dev/tdk", true, true);
    const healthy = checkWslProjectLocation("/home/dev/tdk", true, true);

    expect(warning.didPass).toBe(true);
    expect(warning.isWarning).toBe(true);
    expect(warning.message).toContain("hot reload may be broken");
    expect(strict.didPass).toBe(false);
    expect(strict.fix).toContain("~/projects");
    expect(healthy.didPass).toBe(true);
  });

  it("prints the host 5432 failure before other failures and before passing statuses", () => {
    const checks: CheckResult[] = [
      { name: "Tilt CLI", didPass: false, message: "Tilt is too old", fix: "Update Tilt" },
      { name: "Container Runtime", didPass: true, message: "Docker is running" },
      {
        name: "Host Ports",
        didPass: false,
        message: "Ports Flisk needs are taken:\n    5432 (Postgres) is used by a program",
        fix: "Stop local Postgres",
      },
    ];

    expect(orderDoctorResults(checks).map((check) => check.name)).toEqual([
      "Host Ports",
      "Tilt CLI",
      "Container Runtime",
    ]);
  });

  it("puts Postgres port 5432 first in the host-port failure details", async () => {
    const result = await checkHostPorts((() => "") as never, "tdk-project", async (port) =>
      port === 80 || port === 5432 ? "in-use" : "free",
    );

    expect(result.didPass).toBe(false);
    expect(result.message.indexOf("5432 (Postgres)")).toBeLessThan(
      result.message.indexOf("80 (HTTP)"),
    );
  });

  it("refuses native Windows doctor with WSL2 guidance, diagnostics, and exit code 1", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    const { exit } = captureExit();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
      await expect(doctorCommand.parseAsync(["node", "doctor"], { from: "node" })).rejects.toThrow(
        "process.exit",
      );
      expect(exit).toHaveBeenCalledWith(1);
      expect(error).toHaveBeenCalledWith(NATIVE_WINDOWS_DOCTOR_MESSAGE);
      expect(NATIVE_WINDOWS_DOCTOR_MESSAGE).toContain("WSL2 Ubuntu");
      expect(NATIVE_WINDOWS_DOCTOR_MESSAGE).toContain("docs/wsl2.md");
      const text = log.mock.calls.map((call) => String(call[0])).join("\n");
      expect(text).toContain(NATIVE_WINDOWS_DOCTOR_MESSAGE);
      expect(text).toContain("Docker Desktop is using Linux containers");
      expect(text).toContain("Required ports are available");
    } finally {
      if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
      exit.mockRestore();
      log.mockRestore();
      error.mockRestore();
    }
  });
});
