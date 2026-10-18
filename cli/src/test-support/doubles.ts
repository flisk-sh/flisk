// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { expect, type MockInstance, vi } from "vitest";
import type { DiscoveredResource } from "../types/index.js";

/**
 * Builds an in-memory `DiscoveredResource` for pure tests. Nothing is written to disk; the paths are fake.
 * Use `createTempProject` when a test needs real files.
 */
export function makeResource(
  name: string,
  appType: string,
  config: Record<string, unknown> = {},
): DiscoveredResource {
  return {
    name,
    path: `/tmp/${name}`,
    configPath: `/tmp/${name}/service.json`,
    config: { appName: name, appType, ...config } as DiscoveredResource["config"],
  };
}

export interface ExitCapture {
  /** The spy on `process.exit`. It throws `process.exit`, so the code under test stops where the exit happens. */
  exit: MockInstance;
  /** Asserts that the exit was called with `code` exactly once. */
  expectExit(code: number): void;
}

/**
 * Replaces `process.exit` with a spy that throws. The caller catches the throw, for example with
 * `rejects.toThrow("process.exit")`. Restore it with `vi.restoreAllMocks()` in `afterEach`.
 */
export function captureExit(): ExitCapture {
  const exit = vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);
  return {
    exit,
    expectExit(code: number) {
      expect(exit).toHaveBeenCalledTimes(1);
      expect(exit).toHaveBeenCalledWith(code);
    },
  };
}
