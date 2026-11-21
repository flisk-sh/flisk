// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { JsonObject } from "./types.js";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const PROTOCOL_VERSION = "2025-03-26";
const MAX_SCHEMA_DEPTH = 6;

export function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function isPng(body: Buffer): boolean {
  return PNG_SIGNATURE.every((byte, index) => body[index] === byte);
}

/** The JSON-RPC message in a body, whether the server answered with plain JSON or with an event stream. */
export function parseRpcBody(text: string): JsonObject | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return asObject(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    try {
      const message = asObject(JSON.parse(line.slice(5).trim()));
      if ("result" in message || "error" in message) return message;
    } catch {
      // Not JSON: keep reading the stream.
    }
  }
  return null;
}

export function sampleString(schema: JsonObject): string {
  const format = typeof schema.format === "string" ? schema.format : "";
  let value = "example";
  if (format === "uri" || format === "url") value = "https://example.com";
  else if (format === "email") value = "user@example.com";
  else if (format === "date") value = "2026-01-01";
  else if (format === "date-time") value = "2026-01-01T00:00:00Z";
  const minLength = typeof schema.minLength === "number" ? schema.minLength : 0;
  if (value.length < minLength) value = value.padEnd(minLength, "x");
  const maxLength = typeof schema.maxLength === "number" ? schema.maxLength : undefined;
  return maxLength !== undefined ? value.slice(0, maxLength) : value;
}


export function sampleNumber(schema: JsonObject, isInteger: boolean): number {
  let value = 1;
  if (typeof schema.minimum === "number") value = schema.minimum;
  else if (typeof schema.exclusiveMinimum === "number") value = schema.exclusiveMinimum + 1;
  if (typeof schema.maximum === "number" && value > schema.maximum) value = schema.maximum;
  return isInteger ? Math.ceil(value) : value;
}

/** A value that satisfies a JSON Schema in the common cases: the default, an example, the first enum value, or a typed sample. */
export function sampleValue(schemaInput: unknown, depth = 0): unknown {
  const schema = asObject(schemaInput);
  if ("const" in schema) return schema.const;
  if ("default" in schema) return schema.default;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    const options = asArray(schema[key]).filter((option) => asObject(option).type !== "null");
    if (options.length > 0) return sampleValue(options[0], depth);
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const type = types.find((candidate) => typeof candidate === "string" && candidate !== "null");
  if (type === "string") return sampleString(schema);
  if (type === "integer" || type === "number") return sampleNumber(schema, type === "integer");
  if (type === "boolean") return true;
  if (type === "array") {
    const count = typeof schema.minItems === "number" ? schema.minItems : 0;
    if (depth >= MAX_SCHEMA_DEPTH) return [];
    return Array.from({ length: count }, () => sampleValue(schema.items, depth + 1));
  }
  if (type === "object" || "properties" in schema) {
    return depth >= MAX_SCHEMA_DEPTH ? {} : buildSampleArguments(schema, depth + 1);
  }
  return "example";
}

/** Arguments for one tools/call: a sample value for every required property of the tool's inputSchema. */
export function buildSampleArguments(schemaInput: unknown, depth = 0): JsonObject {
  const schema = asObject(schemaInput);
  const properties = asObject(schema.properties);
  const required = asArray(schema.required).filter(
    (name): name is string => typeof name === "string",
  );
  const out: JsonObject = {};
  for (const name of required) out[name] = sampleValue(properties[name], depth);
  return out;
}

/** Arguments for one prompts/get: "example" for every required prompt argument. */
export function buildPromptArguments(argumentsList: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const argument of asArray(argumentsList)) {
    const { name, required } = asObject(argument);
    if (typeof name === "string" && required === true) out[name] = "example";
  }
  return out;
}

/** icon-512.png beside the endpoint: https://host/mcp has its icon at https://host/icon-512.png. */
export function iconUrlFor(url: string): string {
  return new URL("icon-512.png", url).toString();
}
