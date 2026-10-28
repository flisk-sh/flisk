// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadTiltEvents,
  parseTiltUiResourceList,
  stripTerminalControls,
  TiltEventsLoadError,
} from "../../utils/tilt-events.js";

const { runTiltMock } = vi.hoisted(() => ({ runTiltMock: vi.fn() }));
vi.mock("../../utils/tilt.js", () => ({ runTilt: runTiltMock }));

afterEach(() => {
  vi.unstubAllEnvs();
  runTiltMock.mockReset();
});

describe("Tilt UIResource event timeline", () => {
  it("strips terminal escape sequences from Tilt-controlled strings", () => {
    const result = parseTiltUiResourceList({
      items: [
        {
          metadata: { name: "ap\u001b[2Ji" },
          status: {
            buildHistory: [
              {
                spanID: "x",
                finishTime: "2026-10-07T12:00:00Z",
                error: "boom\u001b]0;pwned\u0007 \u001b[31mred\u001b[0m\u0008",
              },
            ],
          },
        },
      ],
    });
    expect(result.resources[0]?.name).toBe("api");
    expect(result.events[0]?.details).toBe("boom red");
  });

  it("emits an Update queued event for a queued resource without a current build", () => {
    const result = parseTiltUiResourceList({
      items: [
        {
          metadata: { name: "api" },
          status: { queued: true, pendingBuildSince: "2026-10-07T12:05:00Z" },
        },
      ],
    });
    expect(result.events).toEqual([
      expect.objectContaining({
        id: "api:queued",
        kind: "warning",
        title: "Update queued",
        occurredAt: "2026-10-07T12:05:00Z",
      }),
    ]);
  });

  it("maps build history, the current build, and resource status into newest-first events", () => {
    const result = parseTiltUiResourceList({
      items: [
        {
          metadata: { name: "api" },
          status: {
            runtimeStatus: "OK",
            updateStatus: "OK",
            hasPendingChanges: true,
            lastDeployTime: "2026-10-07T11:55:00Z",
            currentBuild: { startTime: "2026-10-07T12:04:00Z" },
            buildHistory: [
              {
                spanID: "complete",
                finishTime: "2026-10-07T12:00:00Z",
                warnings: ["using cached layer"],
              },
              {
                spanID: "failed",
                finishTime: "2026-10-07T12:02:00Z",
                error: "image build failed",
              },
            ],
            conditions: [
              {
                type: "Ready",
                status: "False",
                lastTransitionTime: "2026-10-07T12:03:00Z",
                reason: "Unhealthy",
                message: "readiness probe failed",
              },
            ],
          },
        },
      ],
    });

    expect(result.resources).toEqual([
      {
        name: "api",
        runtimeStatus: "OK",
        updateStatus: "OK",
        hasPendingChanges: true,
      },
    ]);
    expect(result.events.map((event) => event.title)).toEqual([
      "Build in progress",
      "Condition Ready: False",
      "Build failed",
      "Build completed with warnings",
      "Last deployed",
    ]);
    expect(result.events[2].details).toBe("image build failed");
    expect(result.events[3].details).toBe("using cached layer");
  });

  it("returns an empty timeline when Tilt has no resources", () => {
    expect(parseTiltUiResourceList({ items: [] })).toEqual({ resources: [], events: [] });
  });

  it("rejects malformed UIResource responses", () => {
    expect(() => parseTiltUiResourceList({ items: {} })).toThrow("invalid UIResource list");
  });
});

describe("Tilt event ordering and duplicate status", () => {
  it("keeps running events first and assigns unique IDs to repeated conditions", () => {
    const result = parseTiltUiResourceList({
      items: [
        {
          metadata: { name: "api" },
          status: {
            currentBuild: {},
            buildHistory: [{ spanID: "timed", finishTime: "2026-10-07T12:00:00Z" }],
            conditions: [
              { type: "Ready", status: "False" },
              { type: "Ready", status: "False" },
            ],
          },
        },
      ],
    });
    expect(result.events.map((event) => event.kind)).toEqual([
      "running",
      "success",
      "warning",
      "warning",
    ]);
    expect(new Set(result.events.map((event) => event.id)).size).toBe(4);
  });

  it("does not repeat a successful build as a deployment at the same time", () => {
    const result = parseTiltUiResourceList({
      items: [
        {
          metadata: { name: "api" },
          status: {
            lastDeployTime: "2026-10-07T12:00:00Z",
            buildHistory: [{ spanID: "build", finishTime: "2026-10-07T12:00:00Z" }],
          },
        },
      ],
    });
    expect(result.events.map((event) => event.title)).toEqual(["Build completed"]);
  });
});

describe("loadTiltEvents", () => {
  it("uses the configured Tilt UI port", async () => {
    vi.stubEnv("TILT_PORT", "14999");
    runTiltMock.mockResolvedValue({ exitCode: 0, stdout: '{"items":[]}', stderr: "" });
    await expect(loadTiltEvents()).resolves.toEqual({ resources: [], events: [] });
    expect(runTiltMock).toHaveBeenCalledWith(
      "get",
      ["uiresources", "-o", "json", "--port", "14999"],
      { inheritStdio: false, timeoutMs: 10_000 },
    );
  });

  it("classifies a missing Tilt executable and connection failure as unavailable", async () => {
    runTiltMock.mockRejectedValue(new Error("Failed to spawn tilt: spawn tilt ENOENT"));
    await expect(loadTiltEvents()).rejects.toMatchObject({ kind: "unavailable" });
    runTiltMock.mockReset().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "could not connect to Tilt: connection refused",
    });
    await expect(loadTiltEvents()).rejects.toMatchObject({
      kind: "unavailable",
      message: "could not connect to Tilt: connection refused",
    });
  });

  it("preserves command and JSON errors instead of reporting Tilt as unavailable", async () => {
    runTiltMock.mockResolvedValue({ exitCode: 2, stdout: "", stderr: "unknown flag: --port" });
    await expect(loadTiltEvents()).rejects.toBeInstanceOf(TiltEventsLoadError);
    await expect(loadTiltEvents()).rejects.toMatchObject({
      kind: "error",
      message: "unknown flag: --port",
    });
    runTiltMock.mockResolvedValue({ exitCode: 0, stdout: "{bad json", stderr: "" });
    await expect(loadTiltEvents()).rejects.toMatchObject({
      kind: "error",
      message: "Tilt returned invalid UIResource JSON",
    });
  });

  it("classifies a syntactically valid but malformed UIResource list as an error", async () => {
    runTiltMock.mockResolvedValue({ exitCode: 0, stdout: '{"items":{}}', stderr: "" });
    await expect(loadTiltEvents()).rejects.toMatchObject({
      kind: "error",
      message: "Tilt returned an invalid UIResource list",
    });
  });

  it("classifies non-connection spawn failures as errors", async () => {
    runTiltMock.mockRejectedValue(new Error("spawn tilt EACCES"));
    await expect(loadTiltEvents()).rejects.toMatchObject({
      kind: "error",
      message: "spawn tilt EACCES",
    });
  });

  it("stringifies non-Error failures", async () => {
    runTiltMock.mockRejectedValue("connection refused");
    await expect(loadTiltEvents()).rejects.toMatchObject({
      kind: "unavailable",
      message: "connection refused",
    });
  });

  it("falls back to the exit code when Tilt writes nothing to stderr", async () => {
    runTiltMock.mockResolvedValue({ exitCode: 7, stdout: "", stderr: "   " });
    await expect(loadTiltEvents()).rejects.toMatchObject({
      kind: "error",
      message: "tilt get exited with code 7",
    });
  });
});

describe("stripTerminalControls", () => {
  it("strips ANSI color codes and returns plain text", () => {
    const input = "\x1b[31mError\x1b[0m";
    expect(stripTerminalControls(input)).toBe("Error");
  });

  it("returns an ordinary plain string unchanged", () => {
    const input = "Application started successfully";
    expect(stripTerminalControls(input)).toBe(input);
  });

  it("strips complex ANSI formatting including 256-color, 24-bit RGB, and text styles", () => {
    const styled =
      "\x1b[1;4mBold Underline\x1b[0m \x1b[38;5;196mRed256\x1b[0m \x1b[48;2;0;255;0mGreenBgRGB\x1b[0m";
    expect(stripTerminalControls(styled)).toBe("Bold Underline Red256 GreenBgRGB");
  });

  it("strips terminal control characters while preserving meaningful whitespace like tabs and newlines", () => {
    const input = "\x00\x1b[2J\x1b[HLine 1\x07\n\tLine 2\x08";
    expect(stripTerminalControls(input)).toBe("Line 1\n\tLine 2");
  });

  it("returns an empty string unchanged", () => {
    expect(stripTerminalControls("")).toBe("");
  });
});
