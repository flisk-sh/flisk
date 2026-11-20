// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { FliskError } from "../utils/errors.js";
/** Small, commonly used subsets for agents that do not need every tool in their context. */
export const MCP_TOOL_PROFILES = {
    minimal: ["status", "up", "logs"],
};
function isTruthy(value) {
    return value !== undefined && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
function toolProfile(value) {
    if (value === undefined || value.trim() === "")
        return undefined;
    const name = value.trim().toLowerCase();
    if (name in MCP_TOOL_PROFILES)
        return name;
    throw new FliskError(`Unknown MCP tool profile: ${value}. Available profiles: ${Object.keys(MCP_TOOL_PROFILES).join(", ")}`, [`Use --profile minimal to publish only ${MCP_TOOL_PROFILES.minimal.join(", ")}`]);
}
/**
 * Builds the policy for `flisk mcp --read-only`, `--profile minimal` and `--tools a,b`; the environment variables
 * FLISK_MCP_READ_ONLY, FLISK_MCP_PROFILE and FLISK_MCP_TOOLS apply when the flag is absent. Read-only keeps only tools
 * annotated `readOnlyHint`; a profile or allowlist keeps only the named tools; both together keep the intersection.
 * Returns null when nothing is restricted, so the default list stays complete.
 */
export function resolveToolPolicy(tools, options, env = process.env) {
    const readOnly = options.readOnly ?? isTruthy(env.FLISK_MCP_READ_ONLY);
    const profile = toolProfile(options.profile ?? env.FLISK_MCP_PROFILE);
    const rawList = options.tools ?? (profile ? MCP_TOOL_PROFILES[profile].join(",") : env.FLISK_MCP_TOOLS);
    const names = (rawList ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
    if (!readOnly && names.length === 0)
        return null;
    const known = new Set(tools.map((tool) => tool.name));
    const unknown = names.filter((name) => !known.has(name));
    if (unknown.length > 0) {
        throw new FliskError(`Unknown MCP tool in the allowlist: ${unknown.join(", ")}`, [
            `Available tools: ${[...known].join(", ")}`,
        ]);
    }
    const allowed = new Set(names);
    const hasAllowlist = names.length > 0;
    return {
        isAllowed: (tool) => (!readOnly || tool.annotations?.readOnlyHint === true) &&
            (!hasAllowlist || allowed.has(tool.name)),
        refusal: (tool) => {
            const why = readOnly && tool.annotations?.readOnlyHint !== true
                ? "this Flisk MCP server is read-only (started with --read-only or FLISK_MCP_READ_ONLY), so it only runs tools that change nothing"
                : profile
                    ? `this Flisk MCP server publishes only the ${profile} profile (--profile or FLISK_MCP_PROFILE), so it only runs ${MCP_TOOL_PROFILES[profile].join(", ")}`
                    : "this Flisk MCP server only allows an explicit list of tools (--tools or FLISK_MCP_TOOLS)";
            const without = readOnly && tool.annotations?.readOnlyHint !== true
                ? "--read-only"
                : profile
                    ? "--profile"
                    : "--tools";
            return `${tool.name} is not available: ${why}. Do not retry it. Ask the user to run the command themselves, or to restart the MCP server without ${without} to give you write access.`;
        },
    };
}
