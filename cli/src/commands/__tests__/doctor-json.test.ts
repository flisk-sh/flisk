// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureExit, type ExitCapture, parseEnvelope } from "../../test-support/index.js";
import { doctorCommand, NATIVE_WINDOWS_DOCTOR_MESSAGE } from "../doctor.js";

afterEach(() => {
  vi.restoreAllMocks();
  doctorCommand.setOptionValue("json", false);
  doctorCommand.setOptionValue("pingTimeout", "3000");
});

function captureOutput(): { log: ReturnType<typeof vi.spyOn>; exit: ExitCapture["exit"] } {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { exit } = captureExit();
  return { log, exit };
}

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
      const report = parseEnvelope(String(log.mock.calls[0]?.[0]));
      expect(report.data.ready).toBe(false);
      expect(report.data.checks[0].message).toBe(NATIVE_WINDOWS_DOCTOR_MESSAGE);
      expect(report.data.host).toMatchObject({ kind: "native-windows", canUp: false });
      expect(report.errors).toEqual([]);
    } finally {
      Object.defineProperty(process, "platform", platform);
    }
  });
});
