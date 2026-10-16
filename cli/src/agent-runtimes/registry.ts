// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT

import type { BackendFrameworkProvider } from "../backend-frameworks/types.js";
import { TdkError } from "../utils/errors.js";
import { customAgentRuntime } from "./custom.js";

/**
 * Agent runtimes an `agent` resource can be scaffolded with. No runtime is privileged: each is a scaffold plus the
 * process contract in its index file, and `custom` is the default because it has no vendor dependency.
 */
export const AGENT_RUNTIMES: Record<string, BackendFrameworkProvider> = {
  custom: customAgentRuntime,
};

export const DEFAULT_AGENT_RUNTIME = "custom";
export const AGENT_DURABILITY_OPTIONS = ["files", "postgres"] as const;
export type AgentDurability = (typeof AGENT_DURABILITY_OPTIONS)[number];

export function resolveAgentRuntime(runtimeId?: string): BackendFrameworkProvider {
  const id = runtimeId ?? DEFAULT_AGENT_RUNTIME;
  const provider = AGENT_RUNTIMES[id];
  if (!provider) {
    const supported = Object.keys(AGENT_RUNTIMES).join(", ");
    throw new TdkError(`Unknown agent runtime "${id}". Supported runtimes: ${supported}.`, [
      `Use one of: ${supported}`,
      `Omit --runtime to use ${DEFAULT_AGENT_RUNTIME}`,
    ]);
  }
  return provider;
}

export function resolveAgentDurability(value?: string): AgentDurability {
  const durability = value ?? "files";
  if (!(AGENT_DURABILITY_OPTIONS as readonly string[]).includes(durability)) {
    throw new TdkError(`Unknown --durability "${durability}".`, [
      `Use one of: ${AGENT_DURABILITY_OPTIONS.join(", ")}`,
    ]);
  }
  return durability as AgentDurability;
}
