// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Tool-call records for the tool-loop starter. Kept outside server.mjs so the truncation can be tested without the SDK.

export const TOOL_CALL_PREVIEW_CHARS = 200;

/** JSON for objects, verbatim for strings, with a visible tail when the value is too long to keep whole. */
export function truncateToolPreview(value, limit = TOOL_CALL_PREVIEW_CHARS) {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

/**
 * One call's public record: its name, truncated arguments, truncated result, outcome and duration. A failed tool
 * keeps its error text (also truncated) so a session view explains why it failed.
 */
export function toolCallRecord(name, args, resultSummary, ok, started) {
  return {
    name,
    args: truncateToolPreview(args),
    resultSummary: truncateToolPreview(resultSummary),
    ok,
    ms: Date.now() - started,
  };
}
