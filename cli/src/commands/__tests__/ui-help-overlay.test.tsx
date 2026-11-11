// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { PassThrough } from "node:stream";
import { render } from "ink";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTUITheme, TUIThemeContext } from "../../components/ui-theme.js";
import type { DiscoveredResource, DiscoveredStack } from "../../types/index.js";
import { stripTerminalControls } from "../../utils/tilt-events.js";

const { discoverResourcesMock, discoverStacksMock, isTiltAvailableMock, requireProjectRootMock } =
  vi.hoisted(() => ({
    discoverResourcesMock: vi.fn(),
    discoverStacksMock: vi.fn(),
    isTiltAvailableMock: vi.fn(async () => true),
    requireProjectRootMock: vi.fn(),
  }));

vi.mock("../../utils/services.js", () => ({
  clearDiscoveryResultCache: vi.fn(),
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
  };
});

import { TUIApp } from "../ui.js";

interface TestStreams {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  output: () => string;
  rawOutput: () => string;
}

function createTestStreams(): TestStreams {
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
  let raw = "";
  stdout.on("data", (data) => {
    raw += String(data);
  });
  return {
    stdin,
    stdout,
    stderr,
    output: () => stripTerminalControls(raw),
    rawOutput: () => raw,
  };
}

describe("Keyboard Help Overlay (? key)", () => {
  const webService: DiscoveredResource = {
    name: "web",
    path: "/fixtures/sample-project/web",
    configPath: "/fixtures/sample-project/web/service.json",
    stack: "frontend",
    type: "frontend",
    config: { appName: "web", name: "web", appType: "frontend", port: 3000, enabled: true },
  };

  const fixtureServices: DiscoveredResource[] = [webService];
  const fixtureStacks: DiscoveredStack[] = [
    {
      name: "frontend",
      resources: [webService],
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

  it("opens the keyboard help overlay with ? and closes on keypress", async () => {
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

      // Initially, the main overview screen is displayed
      let rendered = io.output();
      expect(rendered).toContain("OVERVIEW");
      expect(rendered).not.toContain("Keyboard Shortcuts");

      // Press ? to open help overlay
      io.stdin.write("?");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      rendered = io.output();
      expect(rendered).toContain("Keyboard Shortcuts");
      expect(rendered).toContain("[OVERVIEW screen]");
      expect(rendered).toContain("Navigate list items");
      expect(rendered).toContain("Next / previous tab");
      expect(rendered).toContain("Press [?] or [Esc] or any key to close");

      // Press ? to close the overlay
      io.stdin.write("?");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      rendered = io.output();
      // Overview is visible again
      expect(rendered).toContain("OVERVIEW");

      // Exit cleanly on q
      io.stdin.write("q");
      await app.waitUntilExit();
    } finally {
      app.unmount();
      io.stdin.destroy();
      io.stdout.destroy();
      io.stderr.destroy();
    }
  });

  it("shows tab-specific shortcuts when opened on different screens", async () => {
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

      // Switch to Events tab (shortcut 3)
      io.stdin.write("3");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      // Open help overlay on Events tab
      io.stdin.write("?");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      const rendered = io.output();
      expect(rendered).toContain("Keyboard Shortcuts");
      expect(rendered).toContain("[EVENTS screen]");
      expect(rendered).toContain("Refresh data");
      expect(rendered).toContain("Direct tab access");

      // Close overlay
      io.stdin.write("\x1b"); // Esc
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      io.stdin.write("q");
      await app.waitUntilExit();
    } finally {
      app.unmount();
      io.stdin.destroy();
      io.stdout.destroy();
      io.stderr.destroy();
    }
  });

  it("renders with NO_COLOR without ANSI color escapes", async () => {
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

      // Open help overlay
      io.stdin.write("?");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      const rendered = io.output();
      expect(rendered).toContain(">>> Keyboard Shortcuts <<<");
      expect(rendered).toContain("[OVERVIEW screen]");

      // Verify no ANSI escape codes are produced in NO_COLOR mode
      const raw = io.rawOutput();
      // Ensure there are no ANSI color codes (\x1b[31m, \x1b[32m, etc.)
      const ansiColorRegex = new RegExp(
        [String.fromCharCode(0x1b), "\\[(?:3|4|9|10)[0-9]m"].join(""),
      );
      expect(ansiColorRegex.test(raw)).toBe(false);

      // Close help overlay
      io.stdin.write("?");
      await new Promise((resolve) => setTimeout(resolve, 50));
      await app.waitUntilRenderFlush();

      // Exit app
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
