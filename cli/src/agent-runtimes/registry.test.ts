// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { TdkError } from "../utils/errors.js";
import { customAgentRuntime } from "./custom.js";
import {
  AGENT_DURABILITY_OPTIONS,
  AGENT_RUNTIMES,
  DEFAULT_AGENT_RUNTIME,
  resolveAgentDurability,
  resolveAgentRuntime,
} from "./registry.js";

describe("agent runtime registry", () => {
  it("registers custom as the only, default runtime", () => {
    expect(AGENT_RUNTIMES).toEqual({ custom: customAgentRuntime });
    expect(DEFAULT_AGENT_RUNTIME).toBe("custom");
    expect(resolveAgentRuntime()).toBe(customAgentRuntime);
    expect(resolveAgentRuntime("custom")).toBe(customAgentRuntime);
  });

  it("rejects an unknown runtime with the supported ids and a recovery hint", () => {
    let error: unknown;
    try {
      resolveAgentRuntime("libfx");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(TdkError);
    const tdkError = error as TdkError;
    expect(tdkError.message).toBe('Unknown agent runtime "libfx". Supported runtimes: custom.');
    expect(tdkError.suggestions).toEqual(["Use one of: custom", "Omit --runtime to use custom"]);
  });
});

describe("agent durability", () => {
  it("defaults to files and accepts every listed option", () => {
    expect(AGENT_DURABILITY_OPTIONS).toEqual(["files", "postgres"]);
    expect(resolveAgentDurability()).toBe("files");
    for (const durability of AGENT_DURABILITY_OPTIONS) {
      expect(resolveAgentDurability(durability)).toBe(durability);
    }
  });

  it("rejects an unknown durability with the allowed values", () => {
    let error: unknown;
    try {
      resolveAgentDurability("redis");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(TdkError);
    const tdkError = error as TdkError;
    expect(tdkError.message).toBe('Unknown --durability "redis".');
    expect(tdkError.suggestions).toEqual(["Use one of: files, postgres"]);
  });
});
