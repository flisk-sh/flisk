// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeResource } from "../../test-support/index.js";
import {
  checkNativeCommands,
  checkNativeDependsOn,
  checkNativeServiceHealth,
} from "../doctor-native.js";
import { isPortListening, isProcessAlive, readNativeRunState } from "../native-runtime.js";

// The run state, the process check and the port probe are faked, so the health check runs without starting a process.
vi.mock("../native-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../native-runtime.js")>()),
  readNativeRunState: vi.fn(),
  isProcessAlive: vi.fn(),
  isPortListening: vi.fn(),
}));

const service = (name: string, config: Record<string, unknown> = {}) =>
  makeResource(name, "bring-your-own", { command: "node server.js", ...config });

const RUNNING = { pid: 4242, services: {} } as unknown as ReturnType<typeof readNativeRunState>;

afterEach(() => {
  vi.mocked(readNativeRunState).mockReset();
  vi.mocked(isProcessAlive).mockReset();
  vi.mocked(isPortListening).mockReset();
  vi.unstubAllGlobals();
});

describe("checkNativeCommands", () => {
  it("passes when every program is installed", () => {
    expect(checkNativeCommands([service("api"), service("web")], () => "/usr/bin/node")).toEqual({
      name: "Service commands",
      didPass: true,
      message: "Every service command starts a program that is installed",
    });
  });
});

describe("checkNativeDependsOn", () => {
  it("passes when every dependsOn names a service of the project", () => {
    expect(
      checkNativeDependsOn([service("api"), service("web", { dependsOn: ["api"] })]),
    ).toMatchObject({ name: "Service dependencies", didPass: true });
  });
});

describe("checkNativeServiceHealth while a native run is up", () => {
  it("skips the check when the recorded run is no longer alive", async () => {
    vi.mocked(readNativeRunState).mockReturnValue(RUNNING);
    vi.mocked(isProcessAlive).mockReturnValue(false);
    const result = await checkNativeServiceHealth(
      "/project",
      [service("api", { port: 4100 })],
      500,
    );
    expect(result).toMatchObject({ didPass: true, isSkipped: true });
    expect(isProcessAlive).toHaveBeenCalledWith(4242);
  });

  it("passes when the health URL answers and the port of a service without one listens", async () => {
    vi.mocked(readNativeRunState).mockReturnValue(RUNNING);
    vi.mocked(isProcessAlive).mockReturnValue(true);
    vi.mocked(isPortListening).mockResolvedValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkNativeServiceHealth(
      "/project",
      [
        service("api", { port: 4100, healthCheckPath: "/health" }),
        service("worker", { port: 4200 }),
        service("job"),
      ],
      500,
    );

    expect(result).toEqual({
      name: "Service Health",
      didPass: true,
      message: "Every running service answers",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4100/health");
    expect(isPortListening).toHaveBeenCalledWith(4200, 500);
  });

  it("fails each service that does not answer, with the URL it asked", async () => {
    vi.mocked(readNativeRunState).mockReturnValue(RUNNING);
    vi.mocked(isProcessAlive).mockReturnValue(true);
    vi.mocked(isPortListening).mockResolvedValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("4100")) return { status: 503 };
        throw new Error("connection refused");
      }),
    );

    const result = await checkNativeServiceHealth(
      "/project",
      [
        service("api", { port: 4100, healthCheckPath: "/health" }),
        service("auth", { port: 4300, healthCheckPath: "/ready" }),
        service("worker", { port: 4200 }),
      ],
      500,
    );

    expect(result).toMatchObject({ name: "Service Health", didPass: false });
    expect(result.message).toBe(
      [
        "api: no answer from http://localhost:4100/health",
        "auth: no answer from http://localhost:4300/ready",
        "worker: no answer from http://localhost:4200",
      ].join("\n    "),
    );
    expect(result.fix).toContain(".flisk/native/logs/<service>.log");
  });
});
