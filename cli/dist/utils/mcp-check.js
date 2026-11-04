// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// `flisk mcp check`: a read-only protocol check of a Streamable HTTP MCP server, local or remote. It sends only
// initialize, list and get requests, plus four malformed requests to see how they are refused. It calls tools only when
// asked to, because a tool call can reach the network or change something on the server's side.
const ACCEPT = "application/json, text/event-stream";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PROTOCOL_VERSION = "2025-03-26";
const MAX_DETAIL = 400;
const MAX_SCHEMA_DEPTH = 6;
function asObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : {};
}
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
function clip(text) {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL - 1)}…` : flat;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** The JSON-RPC message in a body, whether the server answered with plain JSON or with an event stream. */
export function parseRpcBody(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) {
        try {
            return asObject(JSON.parse(trimmed));
        }
        catch {
            return null;
        }
    }
    for (const line of trimmed.split(/\r?\n/)) {
        if (!line.startsWith("data:"))
            continue;
        try {
            const message = asObject(JSON.parse(line.slice(5).trim()));
            if ("result" in message || "error" in message)
                return message;
        }
        catch {
            // Not JSON: keep reading the stream.
        }
    }
    return null;
}
function sampleString(schema) {
    const format = typeof schema.format === "string" ? schema.format : "";
    let value = "example";
    if (format === "uri" || format === "url")
        value = "https://example.com";
    else if (format === "email")
        value = "user@example.com";
    else if (format === "date")
        value = "2026-01-01";
    else if (format === "date-time")
        value = "2026-01-01T00:00:00Z";
    const minLength = typeof schema.minLength === "number" ? schema.minLength : 0;
    if (value.length < minLength)
        value = value.padEnd(minLength, "x");
    const maxLength = typeof schema.maxLength === "number" ? schema.maxLength : undefined;
    return maxLength !== undefined ? value.slice(0, maxLength) : value;
}
function sampleNumber(schema, isInteger) {
    let value = 1;
    if (typeof schema.minimum === "number")
        value = schema.minimum;
    else if (typeof schema.exclusiveMinimum === "number")
        value = schema.exclusiveMinimum + 1;
    if (typeof schema.maximum === "number" && value > schema.maximum)
        value = schema.maximum;
    return isInteger ? Math.ceil(value) : value;
}
/** A value that satisfies a JSON Schema in the common cases: the default, an example, the first enum value, or a typed sample. */
export function sampleValue(schemaInput, depth = 0) {
    const schema = asObject(schemaInput);
    if ("const" in schema)
        return schema.const;
    if ("default" in schema)
        return schema.default;
    if (Array.isArray(schema.examples) && schema.examples.length > 0)
        return schema.examples[0];
    if (Array.isArray(schema.enum) && schema.enum.length > 0)
        return schema.enum[0];
    for (const key of ["anyOf", "oneOf", "allOf"]) {
        const options = asArray(schema[key]).filter((option) => asObject(option).type !== "null");
        if (options.length > 0)
            return sampleValue(options[0], depth);
    }
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const type = types.find((candidate) => typeof candidate === "string" && candidate !== "null");
    if (type === "string")
        return sampleString(schema);
    if (type === "integer" || type === "number")
        return sampleNumber(schema, type === "integer");
    if (type === "boolean")
        return true;
    if (type === "array") {
        const count = typeof schema.minItems === "number" ? schema.minItems : 0;
        if (depth >= MAX_SCHEMA_DEPTH)
            return [];
        return Array.from({ length: count }, () => sampleValue(schema.items, depth + 1));
    }
    if (type === "object" || "properties" in schema) {
        return depth >= MAX_SCHEMA_DEPTH ? {} : buildSampleArguments(schema, depth + 1);
    }
    return "example";
}
/** Arguments for one tools/call: a sample value for every required property of the tool's inputSchema. */
export function buildSampleArguments(schemaInput, depth = 0) {
    const schema = asObject(schemaInput);
    const properties = asObject(schema.properties);
    const required = asArray(schema.required).filter((name) => typeof name === "string");
    const out = {};
    for (const name of required)
        out[name] = sampleValue(properties[name], depth);
    return out;
}
/** Arguments for one prompts/get: "example" for every required prompt argument. */
export function buildPromptArguments(argumentsList) {
    const out = {};
    for (const argument of asArray(argumentsList)) {
        const { name, required } = asObject(argument);
        if (typeof name === "string" && required === true)
            out[name] = "example";
    }
    return out;
}
/** icon-512.png beside the endpoint: https://host/mcp has its icon at https://host/icon-512.png. */
export function iconUrlFor(url) {
    return new URL("icon-512.png", url).toString();
}
function isPng(body) {
    return PNG_SIGNATURE.every((byte, index) => body[index] === byte);
}
class McpProbe {
    url;
    options;
    sessionId = null;
    nextId = 1;
    constructor(url, options) {
        this.url = url;
        this.options = options;
    }
    async http(target, request = {}) {
        const method = request.method ?? "POST";
        const headers = { "user-agent": this.options.userAgent };
        if (method === "POST")
            headers["content-type"] = "application/json";
        const accept = request.accept === undefined ? ACCEPT : request.accept;
        if (accept !== null)
            headers.accept = accept;
        if (this.sessionId && target === this.url)
            headers["mcp-session-id"] = this.sessionId;
        let lastError = "";
        // One try and two retries. Only a network error is retried: an HTTP status is the server's answer.
        for (let attempt = 0; attempt < 3; attempt += 1) {
            if (attempt > 0)
                await sleep(this.options.retryDelayMs);
            try {
                const response = await fetch(target, {
                    method,
                    headers,
                    body: method === "POST" ? request.body : undefined,
                    redirect: "follow",
                    signal: AbortSignal.timeout(this.options.timeoutMs),
                });
                return {
                    status: response.status,
                    contentType: response.headers.get("content-type") ?? "",
                    body: Buffer.from(await response.arrayBuffer()),
                    sessionId: response.headers.get("mcp-session-id"),
                };
            }
            catch (error) {
                const cause = error.cause;
                lastError = `${error instanceof Error ? error.message : String(error)}${cause?.code ? ` (${cause.code})` : cause?.message ? ` (${cause.message})` : ""}`;
            }
        }
        return { status: 0, contentType: "", body: Buffer.alloc(0), sessionId: null, error: lastError };
    }
    async rpc(method, params, request = {}) {
        const message = { jsonrpc: "2.0", id: this.nextId++, method };
        if (params !== undefined)
            message.params = params;
        const response = await this.http(this.url, { ...request, body: JSON.stringify(message) });
        if (method === "initialize" && response.sessionId)
            this.sessionId = response.sessionId;
        return {
            status: response.status,
            message: parseRpcBody(response.body.toString("utf8")),
            error: response.error,
        };
    }
    async notify(method) {
        await this.http(this.url, { body: JSON.stringify({ jsonrpc: "2.0", method }) });
    }
}
function statusText(response) {
    return response.status === 0
        ? `no answer: ${response.error ?? "network error"}`
        : `status ${response.status}`;
}
export async function runMcpCheck(url, options = {}) {
    const probe = new McpProbe(url, {
        userAgent: options.userAgent ?? "flisk-mcp-check (+https://flisk.sh)",
        timeoutMs: options.timeoutMs ?? 30_000,
        retryDelayMs: options.retryDelayMs ?? 1_000,
    });
    const checks = [];
    const add = (check, didPass, detail) => {
        checks.push({ check, didPass, detail: clip(detail) });
    };
    const skip = (check, detail) => {
        checks.push({ check, didPass: true, isSkipped: true, detail });
    };
    const iconUrl = options.icon === false ? null : iconUrlFor(url);
    // 1. initialize: a server name and a tools capability.
    const init = await probe.rpc("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "flisk-mcp-check", version: "1" },
    });
    const initResult = asObject(init.message?.result);
    const capabilities = asObject(initResult.capabilities);
    const serverName = asObject(initResult.serverInfo).name;
    const hasPrompts = "prompts" in capabilities;
    add("initialize", init.status === 200 &&
        typeof serverName === "string" &&
        serverName !== "" &&
        "tools" in capabilities, `${statusText(init)}, server ${typeof serverName === "string" ? serverName : "(none)"}, capabilities [${Object.keys(capabilities).join(", ")}]`);
    if (init.status === 0) {
        // Nothing answers at this address, so every other request would only repeat the same network error.
        return finish(url, iconUrl, null, checks);
    }
    await probe.notify("notifications/initialized");
    // 2. tools/list, and a read-only annotation on every tool.
    const toolsList = await probe.rpc("tools/list");
    const toolsValue = asObject(toolsList.message?.result).tools;
    const tools = asArray(toolsValue).map(asObject);
    const toolNames = tools.map((tool) => String(tool.name ?? "(unnamed)"));
    add("tools/list", toolsList.status === 200 && Array.isArray(toolsValue), `${statusText(toolsList)}, tools [${toolNames.join(", ")}]`);
    for (const [index, tool] of tools.entries()) {
        const readOnly = asObject(tool.annotations).readOnlyHint;
        add(`readOnlyHint ${toolNames[index]}`, readOnly === true, `readOnlyHint=${String(readOnly)}`);
    }
    // 3. one tools/call per tool, only when asked.
    if (!options.call) {
        if (tools.length > 0) {
            skip("tools/call", "not run: pass --call to call each tool once (a call can reach the network)");
        }
    }
    else {
        for (const [index, tool] of tools.entries()) {
            const args = buildSampleArguments(tool.inputSchema);
            const call = await probe.rpc("tools/call", { name: toolNames[index], arguments: args });
            const result = asObject(call.message?.result);
            const content = asArray(result.content);
            const text = String(asObject(content[0]).text ?? "");
            const rpcError = call.message?.error;
            add(`tools/call ${toolNames[index]}`, call.status === 200 && !rpcError && result.isError !== true && content.length > 0, `${statusText(call)}, arguments ${JSON.stringify(args)}, ${rpcError ? `error ${JSON.stringify(rpcError)}` : `isError ${String(result.isError ?? false)}, text ${text}`}`);
        }
    }
    // 4. prompts/list and one prompts/get per prompt. With no prompts capability, an empty list or an error is right.
    const promptsList = await probe.rpc("prompts/list");
    const promptsValue = asObject(promptsList.message?.result).prompts;
    const prompts = asArray(promptsValue).map(asObject);
    const promptNames = prompts.map((prompt) => String(prompt.name ?? "(unnamed)"));
    if (hasPrompts) {
        add("prompts/list", promptsList.status === 200 && Array.isArray(promptsValue), `${statusText(promptsList)}, prompts [${promptNames.join(", ")}]`);
    }
    else {
        const isRefused = promptsList.message !== null && "error" in promptsList.message;
        add("prompts/list", promptsList.message !== null && (isRefused || prompts.length === 0), isRefused
            ? `no prompts capability; refused with ${JSON.stringify(promptsList.message?.error)}`
            : `no prompts capability; ${statusText(promptsList)}, prompts [${promptNames.join(", ")}]${prompts.length > 0 ? ", but initialize did not declare prompts" : ""}`);
    }
    for (const [index, prompt] of prompts.entries()) {
        const args = buildPromptArguments(prompt.arguments);
        const get = await probe.rpc("prompts/get", { name: promptNames[index], arguments: args });
        const messages = asArray(asObject(get.message?.result).messages);
        add(`prompts/get ${promptNames[index]}`, get.status === 200 && messages.length > 0, `${statusText(get)}, arguments ${JSON.stringify(args)}, ${messages.length} message(s)${get.message?.error ? `, error ${JSON.stringify(get.message.error)}` : ""}`);
    }
    // 5. protocol edges.
    const unknown = await probe.rpc("no/such_method");
    const unknownError = asObject(unknown.message?.error);
    add("unknown method is refused (-32601)", unknownError.code === -32601, unknown.message?.error
        ? JSON.stringify(unknown.message.error)
        : `${statusText(unknown)}, no JSON-RPC error`);
    const badJson = await probe.http(url, { body: "not json" });
    add("bad JSON is refused (HTTP 400)", badJson.status === 400, `${statusText(badJson)} ${badJson.body.toString("utf8").slice(0, 120)}`);
    const get = await probe.http(url, { method: "GET", accept: null });
    add("GET is refused (HTTP 405)", get.status === 405, statusText(get));
    const jsonOnly = await probe.rpc("tools/list", undefined, { accept: "application/json" });
    add("a JSON-only Accept header is served (not 406)", jsonOnly.status !== 406 && jsonOnly.status !== 0, statusText(jsonOnly));
    // 6. the icon a directory listing shows.
    if (iconUrl) {
        const icon = await probe.http(iconUrl, { method: "GET", accept: null });
        add("icon-512.png is a PNG", icon.status === 200 && isPng(icon.body), `${iconUrl}: ${statusText(icon)}, ${icon.contentType || "no content-type"}${icon.status === 200 && !isPng(icon.body) ? ", not PNG bytes" : ""}`);
    }
    return finish(url, iconUrl, typeof serverName === "string" ? serverName : null, checks);
}
function finish(url, iconUrl, serverName, checks) {
    const failures = checks.filter((check) => !check.didPass).length;
    return { url, iconUrl, serverName, didPass: failures === 0, failures, checks };
}
