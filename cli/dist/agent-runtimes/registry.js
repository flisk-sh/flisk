// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { TdkError } from "../utils/errors.js";
import { customAgentRuntime } from "./custom.js";
/**
 * Agent runtimes an `agent` resource can be scaffolded with. No runtime is privileged: each is a scaffold plus the
 * process contract in its index file, and `custom` is the default because it has no vendor dependency.
 */
export const AGENT_RUNTIMES = {
    custom: customAgentRuntime,
};
export const DEFAULT_AGENT_RUNTIME = "custom";
// `postgres` is deliberately absent: the scaffold has no Postgres session store yet (#1256), so offering it would produce an
// agent that answers every turn with a 500. Add it here together with the store.
export const AGENT_DURABILITY_OPTIONS = ["files"];
export function resolveAgentRuntime(runtimeId) {
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
export function resolveAgentDurability(value) {
    const durability = value ?? "files";
    if (!AGENT_DURABILITY_OPTIONS.includes(durability)) {
        throw new TdkError(`Unknown --durability "${durability}".`, [
            `Use one of: ${AGENT_DURABILITY_OPTIONS.join(", ")}`,
        ]);
    }
    return durability;
}
