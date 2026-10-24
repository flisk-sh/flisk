// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  createDemoStage,
  type DemoState,
  FRAME_ROWS,
  formatElapsed,
  frameToPlain,
  renderDemoFrame,
  sanitizeCell,
} from "../demo-stage.js";

function baseState(patch: Partial<DemoState> = {}): DemoState {
  return {
    title: "Flisk demo",
    subtitle: "restaurant ops · 6 services · 4 stacks",
    phases: [
      { id: "fetch", label: "Fetching the demo", status: "done", elapsedMs: 900 },
      { id: "config", label: "Generating project config", status: "done", elapsedMs: 12_400 },
      { id: "install", label: "Installing dependencies", status: "active" },
      { id: "start", label: "Starting services", status: "pending" },
    ],
    servicesReady: 3,
    servicesTotal: 6,
    servicesBuilding: 2,
    detail: "240 config files generated",
    elapsedMs: 21_100,
    ...patch,
  };
}

describe("formatElapsed", () => {
  it("keeps one decimal under ten seconds", () => {
    expect(formatElapsed(900)).toBe("0.9s");
  });

  it("drops the decimal after ten seconds", () => {
    expect(formatElapsed(12_400)).toBe("12s");
  });

  it("switches to minutes after a minute", () => {
    expect(formatElapsed(72_000)).toBe("1m 12s");
  });

  it("never prints a negative or non-finite duration", () => {
    expect(formatElapsed(-5)).toBe("0.0s");
    expect(formatElapsed(Number.NaN)).toBe("0.0s");
  });
});

describe("sanitizeCell", () => {
  it("strips ANSI escapes so a repo name cannot move the cursor", () => {
    expect(sanitizeCell("\u001b[31mred\u001b[0m")).toBe("red");
  });

  it("strips a clear-screen sequence", () => {
    expect(sanitizeCell("ok\u001b[2Jdone")).toBe("okdone");
  });
});

describe("renderDemoFrame", () => {
  it("always returns exactly FRAME_ROWS rows", () => {
    expect(renderDemoFrame(baseState())).toHaveLength(FRAME_ROWS);
    expect(renderDemoFrame(baseState({ phases: [] }))).toHaveLength(FRAME_ROWS);
  });

  it("shows the phases, the generated count and the service progress", () => {
    const text = frameToPlain(renderDemoFrame(baseState(), 80)).join("\n");
    expect(text).toContain("Flisk demo");
    expect(text).toContain("✔  Fetching the demo");
    expect(text).toContain("◐  Installing dependencies");
    expect(text).toContain("○  Starting services");
    expect(text).toContain("240 config files generated");
    expect(text).toContain("3 of 6 services ready · 2 building");
  });

  it("puts the running URLs and the version on the finished frame", () => {
    const text = frameToPlain(
      renderDemoFrame(
        baseState({
          done: {
            urls: [
              "app.flisk-demo.localhost/reservation-app",
              "app.flisk-demo.localhost/floor-app",
            ],
            summary: "6 services · Postgres · Traefik",
            hint: "Edit a file — the browser updates.",
            version: "1.3.206",
          },
        }),
        80,
      ),
    ).join("\n");
    expect(text).toContain("Your stack is running");
    expect(text).toContain("app.flisk-demo.localhost/reservation-app");
    expect(text).toContain("Edit a file — the browser updates.");
    expect(text).toContain("flisk 1.3.206");
  });

  it("keeps the failure cause, the fix and the log path", () => {
    const text = frameToPlain(
      renderDemoFrame(
        baseState({
          failure: {
            message: "The stack did not come up.",
            fix: "Run `flisk up` in the project folder to see the full output.",
            logPath: "/Users/me/.flisk/logs/demo.log",
          },
        }),
        80,
      ),
    ).join("\n");
    expect(text).toContain("✖  The demo stopped");
    expect(text).toContain("The stack did not come up.");
    expect(text).toContain("Run `flisk up`");
    expect(text).toContain("log: /Users/me/.flisk/logs/demo.log");
  });

  it("never renders a zero-of-zero progress line", () => {
    const text = frameToPlain(
      renderDemoFrame(baseState({ servicesReady: 0, servicesTotal: 0, servicesBuilding: 0 })),
    ).join("\n");
    expect(text).toContain("no services found");
    expect(text).not.toContain("0 of 0");
  });

  it("fits every row inside the terminal at any common width", () => {
    for (const columns of [40, 60, 80, 120, 200]) {
      const rows = renderDemoFrame(baseState(), columns);
      const limit = Math.min(columns - 1, 78);
      for (const line of frameToPlain(rows)) {
        expect(line.length).toBeLessThanOrEqual(limit);
      }
    }
  });

  it("treats a zero column count as an unknown width, not a tiny terminal", () => {
    const rows = renderDemoFrame(baseState({ subtitle: "restaurant ops" }), 0);
    expect(frameToPlain(rows).join("\n")).toContain("restaurant ops");
    expect(frameToPlain(rows)[0]?.length).toBeGreaterThan(40);
  });

  it("does not wrap when the terminal is absurdly narrow", () => {
    const rows = renderDemoFrame(
      baseState({ subtitle: "a".repeat(200), detail: "b".repeat(200) }),
      10,
    );
    for (const line of frameToPlain(rows)) {
      expect(line.length).toBeLessThanOrEqual(24);
    }
  });

  it("renders an injected escape as inert text", () => {
    const rows = renderDemoFrame(
      baseState({ subtitle: "restaurant\u001b[2Jops", detail: "\u001b[31mred" }),
      80,
    );
    for (const line of frameToPlain(rows)) {
      expect(line).not.toContain("\u001b");
    }
  });
});

type FakeStream = NodeJS.WriteStream & { chunks: string[] };

function fakeStream(isTTY: boolean, columns = 80): FakeStream {
  const chunks: string[] = [];
  return {
    isTTY,
    columns,
    chunks,
    write: (chunk: string) => {
      chunks.push(String(chunk));
      return true;
    },
  } as unknown as FakeStream;
}

describe("createDemoStage", () => {
  it("paints a fixed frame and then rewrites it in place instead of scrolling", () => {
    const stream = fakeStream(true);
    const stage = createDemoStage(baseState(), stream);
    stage.update({ servicesReady: 5 });
    stage.stop();

    const output = stream.chunks.join("");
    expect(output).toContain(`\u001b[${FRAME_ROWS}A`);
    expect(output).toContain("\r\u001b[2K");
  });

  it("prints plain lines on a terminal without a TTY", () => {
    const stream = fakeStream(false);
    const stage = createDemoStage(baseState(), stream);
    stage.update({ servicesReady: 5 });
    stage.stop();

    const output = stream.chunks.join("");
    expect(output).not.toContain("\u001b");
    expect(output).not.toContain("\r");
    expect(output).toContain("5 of 6 services ready");
  });

  it("freezes the clock on finish so the last frame is stable", () => {
    const stream = fakeStream(true);
    let clock = 1000;
    const stage = createDemoStage(baseState({ elapsedMs: 0 }), stream, () => clock);
    clock = 73_000;
    stage.finish({
      urls: ["app.flisk-demo.localhost"],
      summary: "6 services",
      hint: "Edit a file.",
      version: "1.3.206",
    });
    stage.stop();

    const output = stream.chunks.join("");
    expect(output).toContain("1m 12s");
  });

  it("marks the active phase failed and shows the message", () => {
    const stream = fakeStream(true);
    const stage = createDemoStage(baseState(), stream);
    stage.fail("The stack did not come up.", "Run flisk up.");
    stage.stop();

    const output = stream.chunks.join("");
    expect(output).toContain("✖  Installing dependencies");
    expect(output).toContain("The stack did not come up.");
  });
});
