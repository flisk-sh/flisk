import type { JsonObject } from "./types.js";
export declare const PROTOCOL_VERSION = "2025-03-26";
export declare function asObject(value: unknown): JsonObject;
export declare function asArray(value: unknown): unknown[];
export declare function isPng(body: Buffer): boolean;
/** The JSON-RPC message in a body, whether the server answered with plain JSON or with an event stream. */
export declare function parseRpcBody(text: string): JsonObject | null;
export declare function sampleString(schema: JsonObject): string;
export declare function sampleNumber(schema: JsonObject, isInteger: boolean): number;
/** A value that satisfies a JSON Schema in the common cases: the default, an example, the first enum value, or a typed sample. */
export declare function sampleValue(schemaInput: unknown, depth?: number): unknown;
/** Arguments for one tools/call: a sample value for every required property of the tool's inputSchema. */
export declare function buildSampleArguments(schemaInput: unknown, depth?: number): JsonObject;
/** Arguments for one prompts/get: "example" for every required prompt argument. */
export declare function buildPromptArguments(argumentsList: unknown): Record<string, string>;
/** icon-512.png beside the endpoint: https://host/mcp has its icon at https://host/icon-512.png. */
export declare function iconUrlFor(url: string): string;
