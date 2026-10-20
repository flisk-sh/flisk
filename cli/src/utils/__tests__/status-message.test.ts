// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStatusMessageController } from "../status-message.js";

describe("status message controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the default duration of 1500ms when durationMs is omitted", () => {
    const messages: string[] = [];
    const controller = createStatusMessageController((message) => messages.push(message));

    controller.show("Default duration message");
    expect(messages).toEqual(["Default duration message"]);

    vi.advanceTimersByTime(1499);
    expect(messages).toEqual(["Default duration message"]);

    vi.advanceTimersByTime(1);
    expect(messages).toEqual(["Default duration message", ""]);
  });

  it("keeps the newest message visible for its full duration", () => {
    const messages: string[] = [];
    const controller = createStatusMessageController((message) => messages.push(message));

    controller.show("Mouse support enabled", 2000);
    vi.advanceTimersByTime(1000);
    controller.show("Tooltips enabled", 1500);
    vi.advanceTimersByTime(1000);
    expect(messages).toEqual(["Mouse support enabled", "Tooltips enabled"]);
    vi.advanceTimersByTime(499);
    expect(messages).toEqual(["Mouse support enabled", "Tooltips enabled"]);
    vi.advanceTimersByTime(1);
    expect(messages).toEqual(["Mouse support enabled", "Tooltips enabled", ""]);
  });

  it("cancels the pending clear when the UI is disposed", () => {
    const messages: string[] = [];
    const controller = createStatusMessageController((message) => messages.push(message));
    controller.show("Press q to quit");
    vi.advanceTimersByTime(1000);
    controller.dispose();
    vi.advanceTimersByTime(1000);
    expect(messages).toEqual(["Press q to quit"]);
  });

  it("safely handles repeated dispose calls", () => {
    const controller = createStatusMessageController(() => {});
    expect(() => {
      controller.dispose();
      controller.dispose();
    }).not.toThrow();
  });

  it("allows showing new messages after dispose", () => {
    const messages: string[] = [];
    const controller = createStatusMessageController((message) => messages.push(message));

    controller.show("First", 1000);
    controller.dispose();

    controller.show("Second", 500);
    expect(messages).toEqual(["First", "Second"]);

    vi.advanceTimersByTime(500);
    expect(messages).toEqual(["First", "Second", ""]);
  });
});
