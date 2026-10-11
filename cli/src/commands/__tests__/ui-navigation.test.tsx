// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { PassThrough } from "node:stream";
import { render } from "ink";
import { expect, it, vi } from "vitest";
import { createTUITheme, TUIThemeContext } from "../../components/ui-theme.js";
import { tiltGetUiResources } from "../../utils/up-readiness.js";
import { TUIApp } from "../ui.js";

const { discoverResourcesMock, loadTiltEventsMock, TiltEventsLoadErrorMock } = vi.hoisted(() => {
  class MockTiltEventsLoadError extends Error {
    constructor(
      message: string,
      readonly kind: "unavailable" | "error",
    ) {
      super(message);
      this.name = "TiltEventsLoadError";
    }
  }
  return {
    discoverResourcesMock: vi.fn(() => [{ name: "api", path: "/tmp/test/api", stack: "stack-00" }]),
    loadTiltEventsMock: vi.fn(),
    TiltEventsLoadErrorMock: MockTiltEventsLoadError,
  };
});
vi.mock("../../utils/tilt-events.js", async (importOriginal) => ({
  stripTerminalControls: (await importOriginal<typeof import("../../utils/tilt-events.js")>())
    .stripTerminalControls,
  loadTiltEvents: loadTiltEventsMock,
  TiltEventsLoadError: TiltEventsLoadErrorMock,
}));

const ANSI_SGR = new RegExp([String.fromCharCode(0x1b), "\\[[0-?]*[ -/]*[@-~]"].join(""), "g");

vi.mock("../../utils/services.js", () => ({
  clearMetadataCache: vi.fn(),
  discoverStacks: () =>
    Array.from({ length: 30 }, (_, i) => ({
      name: `stack-${String(i).padStart(2, "0")}`,
      resources: [],
      resourceCount: 0,
    })),
  discoverResources: discoverResourcesMock,
  getResourceMetadata: vi.fn(),
  getStackMetadata: (stack: { name: string }) => ({
    name: stack.name,
    resourceCount: 0,
    createdAt: "2026-10-07T00:00:00.000Z",
    lastModified: "2026-10-07T00:00:00.000Z",
    resources: [],
    overallStatus: "unknown",
  }),
}));
vi.mock("../../utils/up-readiness.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/up-readiness.js")>()),
  tiltGetUiResources: vi.fn(async () => null),
}));
vi.mock("../../utils/paths.js", () => ({
  findProjectRoot: () => "/tmp/test",
  getPackageVersion: () => "1.1.0",
}));

function streams() {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode: () => {},
    ref: () => {},
    unref: () => {},
  });
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: true, columns: 100, rows: 24 });
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { isTTY: true, columns: 100, rows: 24 });
  let output = "";
  stdout.on("data", (data) => {
    output += String(data);
  });
  return { stdin, stdout, stderr, output: () => output };
}

it.each([
  [undefined, 10350],
  ["12345", 12345],
  ["12345abc", 10350],
  ["10350.5", 10350],
  ["0", 10350],
  ["-1", 10350],
  ["65536", 10350],
])("polls the validated port for TILT_PORT=%s", async (value, port) => {
  vi.stubEnv("TILT_PORT", value);
  vi.mocked(tiltGetUiResources).mockClear();
  const io = streams();
  const app = render(<TUIApp animated={false} />, {
    stdin: io.stdin,
    stdout: io.stdout,
    stderr: io.stderr,
    interactive: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  try {
    await vi.waitFor(() => expect(tiltGetUiResources).toHaveBeenCalledWith(port));
    expect(vi.mocked(tiltGetUiResources).mock.calls.every(([actual]) => actual === port)).toBe(
      true,
    );
  } finally {
    app.unmount();
    io.stdin.destroy();
    io.stdout.destroy();
    io.stderr.destroy();
    vi.unstubAllEnvs();
  }
});

it("navigates with vim keys and terminal page/home/end sequences while search receives text", async () => {
  const io = streams();
  const app = render(<TUIApp animated={false} />, {
    stdin: io.stdin,
    stdout: io.stdout,
    stderr: io.stderr,
    interactive: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const send = async (key: string) => {
    io.stdin.write(key);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
  };
  const selected = () =>
    io
      .output()
      .replace(ANSI_SGR, "")
      .match(/▓▒░ stack-\d+/g)
      ?.at(-1);
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
    expect(selected(), io.output()).toBe("▓▒░ stack-00");
    await send("j");
    expect(selected()).toBe("▓▒░ stack-01");
    await send("k");
    expect(selected()).toBe("▓▒░ stack-00");
    await send("G");
    expect(selected()).toBe("▓▒░ stack-29");
    await send("g");
    expect(selected()).toBe("▓▒░ stack-00");
    await send("\x1b[6~");
    expect(selected()).toBe("▓▒░ stack-10");
    await send("\x1b[5~");
    expect(selected()).toBe("▓▒░ stack-00");
    await send("\x1b[F");
    expect(selected()).toBe("▓▒░ stack-29");
    await send("\x1b[H");
    expect(selected()).toBe("▓▒░ stack-00");
    await send("\x0b");
    expect(selected()).toBe("▓▒░ stack-00");
    await send("\x1bk");
    expect(selected()).toBe("▓▒░ stack-00");
    io.stdout.rows = 30;
    io.stdout.emit("resize");
    await new Promise((resolve) => setTimeout(resolve, 30));
    await send("\x1b[6~");
    expect(selected()).toBe("▓▒░ stack-16");
    await send("g");
    await send("/");
    await send("j");
    await send("k");
    await send("g");
    expect(io.output()).toContain("Search: jkg_");
    await send("\x1b");
    await send("G");
    await send("\r");
    expect(io.output()).toContain("Selected stack: stack-29");
  } finally {
    app.unmount();
    io.stdin.destroy();
    io.stdout.destroy();
    io.stderr.destroy();
  }
});

it("uses the shared keymap for footer hints and the help panel", async () => {
  const io = streams();
  io.stdout.rows = 40;
  loadTiltEventsMock.mockReset().mockResolvedValue({ resources: [], events: [] });
  const app = render(<TUIApp animated={false} />, {
    stdin: io.stdin,
    stdout: io.stdout,
    stderr: io.stderr,
    interactive: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const send = async (key: string) => {
    io.stdin.write(key);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
  };
  const output = () => io.output().replace(ANSI_SGR, "");
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
    expect(output()).toContain("[Enter or Space] Select");
    expect(output()).toContain("[e] show all");
    await send("3");
    await new Promise((resolve) => setTimeout(resolve, 2100));
    await app.waitUntilRenderFlush();
    expect(output()).toContain("[Tab/Shift+Tab] Tabs");
    await send("?");
    expect(output()).toContain("Keyboard Shortcuts");
    expect(output()).toContain("Tab/Shift+Tab Next / previous tab");
    expect(output()).toContain("1-5 Direct tab access");
    expect(output()).toContain("Enter or Space Select item / Open detail");
  } finally {
    app.unmount();
    io.stdin.destroy();
    io.stdout.destroy();
    io.stderr.destroy();
  }
});

it("renders Tilt events and refreshes them with r", async () => {
  const snapshot = {
    resources: [{ name: "api", runtimeStatus: "OK", updateStatus: "OK", hasPendingChanges: false }],
    events: [
      {
        id: "api:build:one",
        resourceName: "api",
        kind: "success" as const,
        title: "Build completed",
        occurredAt: "2026-10-07T12:00:00Z",
      },
    ],
  };
  discoverResourcesMock
    .mockReset()
    .mockReturnValue([{ name: "api", path: "/tmp/test/api", stack: "stack-00" }]);
  loadTiltEventsMock.mockReset().mockResolvedValue(snapshot);
  const theme = createTUITheme(false, { NO_COLOR: "1" });
  const io = streams();
  const app = render(
    <TUIThemeContext.Provider value={theme}>
      <TUIApp animated={false} />
    </TUIThemeContext.Provider>,
    {
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      interactive: true,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  );
  const send = async (key: string) => {
    io.stdin.write(key);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
  };
  try {
    await send("3");
    const output = io.output().replace(ANSI_SGR, "");
    expect(output).toContain("[ Event Timeline ]");
    expect(output).toContain("api: Runtime OK; Update OK");
    expect(output).toContain("Build completed");
    expect(loadTiltEventsMock).toHaveBeenCalledTimes(1);
    await send("r");
    expect(loadTiltEventsMock).toHaveBeenCalledTimes(2);
  } finally {
    app.unmount();
    io.stdin.destroy();
    io.stdout.destroy();
    io.stderr.destroy();
  }
});

it("shows a friendly state when Tilt cannot provide events", async () => {
  discoverResourcesMock
    .mockReset()
    .mockReturnValue([{ name: "api", path: "/tmp/test/api", stack: "stack-00" }]);
  loadTiltEventsMock
    .mockReset()
    .mockRejectedValue(new TiltEventsLoadErrorMock("Tilt is offline", "unavailable"));
  const io = streams();
  const app = render(<TUIApp animated={false} />, {
    stdin: io.stdin,
    stdout: io.stdout,
    stderr: io.stderr,
    interactive: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const send = async (key: string) => {
    io.stdin.write(key);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
  };
  try {
    await send("3");
    const output = io.output().replace(ANSI_SGR, "");
    expect(output).toContain("Tilt is not running or its UI is unreachable.");
    expect(output).toContain("press [r] to retry.");
    await send("r");
    expect(loadTiltEventsMock).toHaveBeenCalledTimes(2);
  } finally {
    app.unmount();
    io.stdin.destroy();
    io.stdout.destroy();
    io.stderr.destroy();
  }
});

it("keeps the Events tab reachable when no local services are discovered", async () => {
  discoverResourcesMock.mockReset().mockReturnValue([]);
  loadTiltEventsMock.mockReset().mockResolvedValue({ resources: [], events: [] });
  const io = streams();
  const app = render(<TUIApp animated={false} />, {
    stdin: io.stdin,
    stdout: io.stdout,
    stderr: io.stderr,
    interactive: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const send = async (key: string) => {
    io.stdin.write(key);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
  };
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
    expect(io.output().replace(ANSI_SGR, "")).toContain("No service.json files found");
    await send("\x1b");
    expect(io.output().replace(ANSI_SGR, "")).toContain("Press q to quit");
    await send("3");
    const output = io.output().replace(ANSI_SGR, "");
    expect(output).toContain("Event Timeline");
    expect(output).toContain("No recent build events are available from Tilt yet.");
    expect(loadTiltEventsMock).toHaveBeenCalledTimes(1);
  } finally {
    app.unmount();
    io.stdin.destroy();
    io.stdout.destroy();
    io.stderr.destroy();
  }
});

it("discards stale event responses and shows a loading state", async () => {
  discoverResourcesMock
    .mockReset()
    .mockReturnValue([{ name: "api", path: "/tmp/test/api", stack: "stack-00" }]);
  const snapshot = {
    resources: [],
    events: [
      {
        id: "latest",
        resourceName: "api",
        kind: "success" as const,
        title: "Latest response",
        occurredAt: "2026-10-07T12:00:00Z",
      },
    ],
  };
  let rejectFirst!: (reason: unknown) => void;
  let resolveSecond!: (value: typeof snapshot) => void;
  const first = new Promise<typeof snapshot>((_resolve, reject) => {
    rejectFirst = reject;
  });
  const second = new Promise<typeof snapshot>((resolve) => {
    resolveSecond = resolve;
  });
  loadTiltEventsMock
    .mockReset()
    .mockImplementationOnce(() => first)
    .mockImplementationOnce(() => second);
  const io = streams();
  const app = render(<TUIApp animated={false} />, {
    stdin: io.stdin,
    stdout: io.stdout,
    stderr: io.stderr,
    interactive: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const send = async (key: string) => {
    io.stdin.write(key);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
  };
  const flush = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await app.waitUntilRenderFlush();
  };
  try {
    await send("3");
    expect(io.output().replace(ANSI_SGR, "")).toContain("Loading Tilt events...");
    await send("r");
    expect(loadTiltEventsMock).toHaveBeenCalledTimes(2);
    resolveSecond(snapshot);
    await flush();
    expect(io.output().replace(ANSI_SGR, "")).toContain("Latest response");
    rejectFirst(new TiltEventsLoadErrorMock("Tilt is offline", "unavailable"));
    await flush();
    const output = io.output().replace(ANSI_SGR, "");
    expect(output).toContain("Latest response");
    expect(output).not.toContain("Tilt is not running or its UI is unreachable.");
  } finally {
    app.unmount();
    io.stdin.destroy();
    io.stdout.destroy();
    io.stderr.destroy();
  }
});

it("shows command and parsing errors without calling Tilt unavailable", async () => {
  discoverResourcesMock
    .mockReset()
    .mockReturnValue([{ name: "api", path: "/tmp/test/api", stack: "stack-00" }]);
  loadTiltEventsMock
    .mockReset()
    .mockRejectedValue(
      new TiltEventsLoadErrorMock("Tilt returned invalid UIResource JSON", "error"),
    );
  const io = streams();
  const app = render(<TUIApp animated={false} />, {
    stdin: io.stdin,
    stdout: io.stdout,
    stderr: io.stderr,
    interactive: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const send = async (key: string) => {
    io.stdin.write(key);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
  };
  try {
    await send("3");
    const output = io.output().replace(ANSI_SGR, "");
    expect(output).toContain("Could not load Tilt events.");
    expect(output).toContain("Tilt returned invalid UIResource JSON");
    expect(output).not.toContain("Tilt is not running or its UI is unreachable.");
  } finally {
    app.unmount();
    io.stdin.destroy();
    io.stdout.destroy();
    io.stderr.destroy();
  }
});

it("truncates event details and labels the event limit", async () => {
  discoverResourcesMock
    .mockReset()
    .mockReturnValue([{ name: "api", path: "/tmp/test/api", stack: "stack-00" }]);
  const longDetails = "build output ".repeat(30);
  loadTiltEventsMock.mockReset().mockResolvedValue({
    resources: [{ name: "api", runtimeStatus: "OK" }],
    events: Array.from({ length: 21 }, (_, index) => ({
      id: `event-${index}`,
      resourceName: "api",
      kind: "warning" as const,
      title: `Build event ${index}`,
      occurredAt: "2026-10-07T12:00:00Z",
      details: index === 0 ? longDetails : undefined,
    })),
  });
  const io = streams();
  const app = render(<TUIApp animated={false} />, {
    stdin: io.stdin,
    stdout: io.stdout,
    stderr: io.stderr,
    interactive: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  const send = async (key: string) => {
    io.stdin.write(key);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await app.waitUntilRenderFlush();
  };
  try {
    await send("3");
    const output = io.output().replace(ANSI_SGR, "");
    expect(output).toContain("2026-10-07 12:00:00Z");
    expect(output).toContain("Showing first 20 events");
    expect(output).toMatch(/\.\.\.|\u2026/);
    expect(output).not.toContain(longDetails);
    expect(output).not.toContain("Build event 20");
  } finally {
    app.unmount();
    io.stdin.destroy();
    io.stdout.destroy();
    io.stderr.destroy();
  }
});
