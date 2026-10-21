// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureExit, type ExitCapture, parseEnvelope } from "../../test-support/index.js";
import type { CheckResult } from "../../types/index.js";
import {
  collectDoctorChecks,
  createDoctorReport,
  getDoctorExitCode,
} from "../../utils/doctor-report.js";
import { getHostPortPlan } from "../../utils/host-port-config.js";
import { doctorCommand, NATIVE_WINDOWS_DOCTOR_MESSAGE } from "../doctor.js";

vi.mock("../../utils/doctor-report.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/doctor-report.js")>();
  return {
    ...actual,
    collectDoctorChecks: vi.fn(actual.collectDoctorChecks),
  };
});

vi.mock("../../utils/host-port-config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/host-port-config.js")>();
  return {
    ...actual,
    getHostPortPlan: vi.fn(actual.getHostPortPlan),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  doctorCommand.setOptionValue("json", false);
  doctorCommand.setOptionValue("ping", true);
  doctorCommand.setOptionValue("pingTimeout", "3000");
});

function captureOutput(): { log: ReturnType<typeof vi.spyOn>; exit: ExitCapture["exit"] } {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { exit } = captureExit();
  return { log, exit };
}

const PASSING_CHECK: CheckResult = {
  name: "Container Runtime",
  didPass: true,
  message: "Docker daemon is running",
};

const FAILING_CHECK: CheckResult = {
  name: "Tilt CLI",
  didPass: false,
  message: "Tilt CLI not found",
  fix: "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash",
};

const SKIPPED_CHECK: CheckResult = {
  name: "Service Health",
  didPass: true,
  isSkipped: true,
  message: "Skipped (--no-ping)",
};

describe("doctor JSON command", () => {
  it.each(["0", "-1", "1.5", "10ms", "NaN", "9007199254740992"])(
    "reports invalid timeout %s without probes",
    async (timeout) => {
      const { log, exit } = captureOutput();
      await expect(
        doctorCommand.parseAsync(["--json", "--ping-timeout", timeout], { from: "user" }),
      ).rejects.toThrow("exit");
      expect(exit).toHaveBeenCalledWith(2);
      expect(log).toHaveBeenCalledTimes(1);
      const report = parseEnvelope(String(log.mock.calls[0]?.[0]));
      expect(report.schemaVersion).toBe(1);
      expect(report.data.ready).toBe(false);
      expect(report.data.checks).toEqual([]);
      expect(report.errors[0].code).toBe("USAGE");
    },
  );

  it("uses the same invalid-timeout exit for text mode", async () => {
    const { log, exit } = captureOutput();
    await expect(
      doctorCommand.parseAsync(["--ping-timeout", "0"], { from: "user" }),
    ).rejects.toThrow("exit");
    expect(exit).toHaveBeenCalledWith(2);
    expect(log).not.toHaveBeenCalled();
  });

  it("reports native Windows as a blocking finding with the existing guidance", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    if (!platform) throw new Error("Missing process.platform descriptor");
    const { log, exit } = captureOutput();
    try {
      Object.defineProperty(process, "platform", { configurable: true, value: "win32" });
      await expect(doctorCommand.parseAsync(["--json"], { from: "user" })).rejects.toThrow("exit");
      expect(exit).toHaveBeenCalledWith(1);
      expect(log).toHaveBeenCalledTimes(1);

      const rawStdout = String(log.mock.calls[0]?.[0]);
      expect(rawStdout).not.toContain("Flisk Doctor");
      expect(rawStdout).not.toContain("Checking environment...");
      expect(rawStdout).not.toMatch(/[🔍✓✗○⚠]/u);

      const report = parseEnvelope(rawStdout);
      expect(report.data.ready).toBe(false);
      expect(report.data.checks[0].message).toBe(NATIVE_WINDOWS_DOCTOR_MESSAGE);
      expect(report.data.checks[0].fix).toContain("WSL2 Ubuntu");
      expect(report.data.host).toMatchObject({ kind: "native-windows", canUp: false });
      expect(report.errors).toEqual([]);
    } finally {
      Object.defineProperty(process, "platform", platform);
    }
  });

  it("preserves passing, failing (with fix), and skipped check fields in createDoctorReport", () => {
    const failingReport = createDoctorReport([PASSING_CHECK, FAILING_CHECK, SKIPPED_CHECK], true);
    const parsedFailing = JSON.parse(JSON.stringify(failingReport));
    expect(parsedFailing.data.ready).toBe(false);
    expect(parsedFailing.data.checks).toEqual([
      {
        name: "Container Runtime",
        didPass: true,
        message: "Docker daemon is running",
      },
      {
        name: "Tilt CLI",
        didPass: false,
        message: "Tilt CLI not found",
        fix: "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash",
      },
      {
        name: "Service Health",
        didPass: true,
        isSkipped: true,
        message: "Skipped (--no-ping)",
      },
    ]);
    expect(getDoctorExitCode(failingReport)).toBe(1);

    const passingReport = createDoctorReport([PASSING_CHECK, SKIPPED_CHECK], true);
    const parsedPassing = JSON.parse(JSON.stringify(passingReport));
    expect(parsedPassing.data.ready).toBe(true);
    expect(parsedPassing.data.checks).toEqual([PASSING_CHECK, SKIPPED_CHECK]);
    expect(getDoctorExitCode(passingReport)).toBe(0);
  });

  it("emits a single JSON document on Linux without human banners and matches text mode exit code 1 on failure", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    if (!platform) throw new Error("Missing process.platform descriptor");
    vi.mocked(getHostPortPlan).mockResolvedValue({
      ingressHttp: 80,
      ingressHttps: 443,
      postgres: 5432,
      requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
      explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
      reason: { ingressHttp: "preferred", ingressHttps: "preferred", postgres: "preferred" },
    });
    vi.mocked(collectDoctorChecks).mockResolvedValue({
      checks: [PASSING_CHECK, FAILING_CHECK, SKIPPED_CHECK],
      errors: [],
    });

    try {
      Object.defineProperty(process, "platform", { configurable: true, value: "linux" });

      const jsonRun = captureOutput();
      await expect(
        doctorCommand.parseAsync(["--json", "--no-ping"], { from: "user" }),
      ).rejects.toThrow("exit");
      expect(jsonRun.exit).toHaveBeenCalledWith(1);
      expect(jsonRun.log).toHaveBeenCalledTimes(1);

      const rawStdout = String(jsonRun.log.mock.calls[0]?.[0]);
      expect(rawStdout).not.toContain("Flisk Doctor");
      expect(rawStdout).not.toContain("Checking environment...");
      expect(rawStdout).not.toMatch(/[🔍✓✗○⚠]/u);

      const parsed = JSON.parse(rawStdout);
      const report = parseEnvelope(rawStdout);
      expect(parsed).toEqual(report);
      expect(report.data.ready).toBe(false);
      // Failing checks are ordered before passing and skipped checks by orderDoctorResults
      expect(report.data.checks).toEqual([FAILING_CHECK, PASSING_CHECK, SKIPPED_CHECK]);
      expect(report.errors).toEqual([]);

      jsonRun.log.mockRestore();
      jsonRun.exit.mockRestore();
      doctorCommand.setOptionValue("json", false);
      doctorCommand.setOptionValue("ping", true);

      const textRun = captureOutput();
      await expect(doctorCommand.parseAsync(["--no-ping"], { from: "user" })).rejects.toThrow(
        "exit",
      );
      expect(textRun.exit).toHaveBeenCalledWith(1);
      const textLines = textRun.log.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
      expect(textLines).toContain("Flisk Doctor");
      expect(textLines).toContain("Checking environment...");
    } finally {
      Object.defineProperty(process, "platform", platform);
    }
  });

  it("exits 0 in both --json and text mode when all non-skipped checks pass", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform");
    if (!platform) throw new Error("Missing process.platform descriptor");
    vi.mocked(getHostPortPlan).mockResolvedValue({
      ingressHttp: 80,
      ingressHttps: 443,
      postgres: 5432,
      requested: { ingressHttp: 80, ingressHttps: 443, postgres: 5432 },
      explicit: { ingressHttp: false, ingressHttps: false, postgres: false },
      reason: { ingressHttp: "preferred", ingressHttps: "preferred", postgres: "preferred" },
    });
    vi.mocked(collectDoctorChecks).mockResolvedValue({
      checks: [PASSING_CHECK, SKIPPED_CHECK],
      errors: [],
    });

    try {
      Object.defineProperty(process, "platform", { configurable: true, value: "linux" });

      const jsonRun = captureOutput();
      await doctorCommand.parseAsync(["--json", "--no-ping"], { from: "user" });
      expect(jsonRun.exit).not.toHaveBeenCalled();
      expect(jsonRun.log).toHaveBeenCalledTimes(1);

      const rawStdout = String(jsonRun.log.mock.calls[0]?.[0]);
      expect(rawStdout).not.toContain("Flisk Doctor");
      expect(rawStdout).not.toContain("Checking environment...");
      const report = parseEnvelope(rawStdout);
      expect(report.data.ready).toBe(true);
      expect(report.data.checks).toEqual([PASSING_CHECK, SKIPPED_CHECK]);

      jsonRun.log.mockRestore();
      jsonRun.exit.mockRestore();
      doctorCommand.setOptionValue("json", false);
      doctorCommand.setOptionValue("ping", true);

      const textRun = captureOutput();
      await doctorCommand.parseAsync(["--no-ping"], { from: "user" });
      expect(textRun.exit).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, "platform", platform);
    }
  });
});
