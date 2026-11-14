// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { FliskError } from "../utils/errors.js";
function isTruthy(value) {
    return value !== undefined && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
/**
 * Builds the policy for `flisk mcp --read-only` and `--tools a,b`; the environment variables FLISK_MCP_READ_ONLY and
 * FLISK_MCP_TOOLS apply when the flag is absent. Read-only keeps only tools annotated `readOnlyHint`; an allowlist keeps only
 * the named tools; both together keep the read-only tools that are named. Returns null when nothing is restricted.
 */
export function resolveToolPolicy(tools, options, env = process.env) {
    const readOnly = options.readOnly ?? isTruthy(env.FLISK_MCP_READ_ONLY);
    const rawList = options.tools ?? env.FLISK_MCP_TOOLS;
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
                : "this Flisk MCP server only allows an explicit list of tools (--tools or FLISK_MCP_TOOLS)";
            return `${tool.name} is not available: ${why}. Do not retry it. Ask the user to run the command themselves, or to restart the MCP server without ${readOnly ? "--read-only" : "--tools"} to give you write access.`;
        },
    };
}
