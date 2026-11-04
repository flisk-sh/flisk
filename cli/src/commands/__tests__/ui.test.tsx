// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { PassThrough } from "node:stream";
import { render } from "ink";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTUITheme, TUIThemeContext } from "../../components/ui-theme.js";
import type { DiscoveredResource, DiscoveredStack } from "../../types/index.js";
import { stripTerminalControls } from "../../utils/tilt-events.js";

const {
  discoverResourcesMock,
  discoverStacksMock,
  isTiltAvailableMock,
  requireProjectRootMock,
  tiltNotInstalledExitMock,
} = vi.hoisted(() => ({
  discoverResourcesMock: vi.fn(),
  discoverStacksMock: vi.fn(),
  isTiltAvailableMock: vi.fn(async () => true),
  requireProjectRootMock: vi.fn(),
  tiltNotInstalledExitMock: vi.fn(),
}));

vi.mock("../../utils/services.js", () => ({
  clearMetadataCache: vi.fn(),
  discoverStacks: discoverStacksMock,
  discoverResources: discoverResourcesMock,
  getResourceMetadata: vi.fn(),
  getStackMetadata: vi.fn((stack: { name: string }) => ({
    name: stack.name,
    resourceCount: 1,
    createdAt: "2026-10-07T00:00:00.000Z",
    lastModified: "2026-10-07T00:00:00.000Z",
    resources: [],
    overallStatus: "unknown",
  })),
}));

vi.mock("../../utils/up-readiness.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/up-readiness.js")>()),
  tiltGetUiResources: vi.fn(async () => null),
}));

vi.mock("../../utils/agent-sessions.js", () => ({
  fetchAgentOverview: vi.fn(async () => null),
}));

vi.mock("../../utils/tilt-events.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/tilt-events.js")>();
  return {
    ...actual,
    loadTiltEvents: vi.fn(async () => ({ resources: [], events: [] })),
  };
});

vi.mock("../../utils/paths.js", () => ({
  findProjectRoot: () => "/fixtures/sample-project",
  getPackageVersion: () => "1.4.33",
}));

vi.mock("../../utils/tilt.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/tilt.js")>();
  return {
    ...actual,
    isTiltAvailable: isTiltAvailableMock,
  };
});

vi.mock("../../utils/errors.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/errors.js")>();
  return {
    ...actual,
    requireProjectRoot: requireProjectRootMock,
    errorFactories: {
      ...actual.errorFactories,
      tiltNotInstalled: () => ({
        exit: tiltNotInstalledExitMock,
      }),
    },
  };
});

import { TUIApp, uiCommand } from "../ui.js";

function createTestStreams() {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode: () => {},
    ref: () => {},
    unref: () => {},
  });
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: true, columns: 120, rows: 30 });
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { isTTY: true, columns: 120, rows: 30 });
  let output = "";
  stdout.on("data", (data) => {
    output += String(data);
  });
  return { stdin, stdout, stderr, output: () => stripTerminalControls(output) };
}

describe("ui command definition", () => {
  it("registers command name, alias, and description", () => {
    expect(uiCommand.name()).toBe("ui");
    expect(uiCommand.alias()).toBe("interactive");
    expect(uiCommand.description()).toBe(
      "Interactive TUI for managing stacks and services (Neon Edition)",
    );
  });

  it("registers expected options", () => {
    const optionFlags = uiCommand.options.map((opt) => opt.flags);
    expect(optionFlags).toContain("-v, --verbose");
    expect(optionFlags).toContain("--no-animations");
    expect(optionFlags).toContain("--high-contrast");
  });

  it("exits with tiltNotInstalled when Tilt is not available", async () => {
    isTiltAvailableMock.mockResolvedValueOnce(false);
    tiltNotInstalledExitMock.mockImplementationOnce(() => {
      throw new Error("tilt not installed exit");
    });

    await expect(uiCommand.parseAsync(["node", "flisk"], { from: "node" })).rejects.toThrow(
      "tilt not installed exit",
    );

    expect(tiltNotInstalledExitMock).toHaveBeenCalledOnce();
    expect(requireProjectRootMock).not.toHaveBeenCalled();
  });
});

describe("ui TUI render and interaction", () => {
  const webService: DiscoveredResource = {
    name: "web",
    path: "/fixtures/sample-project/web",
    configPath: "/fixtures/sample-project/web/service.json",
    stack: "frontend",
    type: "frontend",
    config: { appName: "web", name: "web", appType: "frontend", port: 3000, enabled: true },
  };

  const apiService: DiscoveredResource = {
    name: "api",
    path: "/fixtures/sample-project/api",
    configPath: "/fixtures/sample-project/api/service.json",
    stack: "backend",
    type: "backend",
    config: { appName: "api", name: "api", appType: "backend", port: 8080, enabled: true },
  };

  const fixtureServices: DiscoveredResource[] = [webService, apiService];

  const fixtureStacks: DiscoveredStack[] = [
    {
      name: "frontend",
      resources: [webService],
      resourceCount: 1,
    },
    {
      name: "backend",
      resources: [apiService],
      resourceCount: 1,
    },
  ];

  beforeEach(() => {
    discoverResourcesMock.mockReturnValue(fixtureServices);
    discoverStacksMock.mockReturnValue(fixtureStacks);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("mounts, shows the project and service list from fixtures, and exits on q", async () => {
    const io = createTestStreams();
    const theme = createTUITheme(false, { NO_COLOR: "1" });

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

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      const rendered = io.output();

      // Header and project root
      expect(rendered).toContain("/fixtures/sample-project");
      expect(rendered).toContain("1.4.33");

      // Tabs
      expect(rendered).toContain("OVERVIEW");
      expect(rendered).toContain("RESOURCES");
      expect(rendered).toContain("FILES");
      expect(rendered).toContain("EVENTS");
      expect(rendered).toContain("CONFIG");

      // Fixture stack items in overview
      expect(rendered).toContain("frontend (1 resources)");
      expect(rendered).toContain("backend (1 resources)");

      // Status footer summary
      expect(rendered).toContain("Stacks: 2");
      expect(rendered).toContain("Services: 2");

      // Exit on q
      io.stdin.write("q");
      await app.waitUntilExit();
    } finally {
      app.unmount();
      io.stdin.destroy();
      io.stdout.destroy();
      io.stderr.destroy();
    }
  });

  it("renders empty state when no services are discovered and exits on q", async () => {
    discoverResourcesMock.mockReturnValue([]);
    discoverStacksMock.mockReturnValue([]);

    const io = createTestStreams();
    const app = render(<TUIApp animated={false} />, {
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      interactive: true,
      exitOnCtrlC: false,
      patchConsole: false,
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      const rendered = io.output();
      expect(rendered).toContain("No Services Found");
      expect(rendered).toContain("No service.json files found");

      io.stdin.write("q");
      await app.waitUntilExit();
    } finally {
      app.unmount();
      io.stdin.destroy();
      io.stdout.destroy();
      io.stderr.destroy();
    }
  });

  it("renders error state when discovering services fails, and exits on q", async () => {
    discoverStacksMock.mockImplementation(() => {
      throw new Error("Failed to read project stacks");
    });

    const io = createTestStreams();
    const app = render(<TUIApp animated={false} />, {
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      interactive: true,
      exitOnCtrlC: false,
      patchConsole: false,
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      const rendered = io.output();
      expect(rendered).toContain("Could Not Load Services");
      expect(rendered).toContain("Failed to read project stacks");

      io.stdin.write("q");
      await app.waitUntilExit();
    } finally {
      app.unmount();
      io.stdin.destroy();
      io.stdout.destroy();
      io.stderr.destroy();
    }
  });

  it("allows switching tabs and exiting on q", async () => {
    const io = createTestStreams();
    const app = render(<TUIApp animated={false} />, {
      stdin: io.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      interactive: true,
      exitOnCtrlC: false,
      patchConsole: false,
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      // Switch to resources tab using shortcut key 2
      io.stdin.write("2");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      const rendered = io.output();
      expect(rendered).toContain("Resources");

      io.stdin.write("q");
      await app.waitUntilExit();
    } finally {
      app.unmount();
      io.stdin.destroy();
      io.stdout.destroy();
      io.stderr.destroy();
    }
  });
});
