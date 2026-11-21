// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import type { McpCheckOptions, McpCheckReport, McpCheckResult, McpTransport } from "./types.js";
import { asObject, asArray, isPng, PROTOCOL_VERSION, buildPromptArguments, buildSampleArguments, iconUrlFor } from "./protocol.js";
import { McpProbe } from "./transport.js";

const MAX_DETAIL = 400;

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL - 1)}…` : flat;
}

function statusText(response: { status: number; error?: string }): string {
  return response.status === 0
    ? `no answer: ${response.error ?? "network error"}`
    : `status ${response.status}`;
}

export async function runMcpCheck(
  url: string,
  options: McpCheckOptions = {},
): Promise<McpCheckReport> {
  const probe = new McpProbe(url, {
    userAgent: options.userAgent ?? "flisk-mcp-check (+https://flisk.sh)",
    timeoutMs: options.timeoutMs ?? 30_000,
    retryDelayMs: options.retryDelayMs ?? 1_000,
  });
  return runChecks(probe, url, options);
}

export async function runChecks(
  probe: McpTransport,
  url: string,
  options: McpCheckOptions = {},
): Promise<McpCheckReport> {
  const checks: McpCheckResult[] = [];
  const add = (check: string, didPass: boolean, detail: string): void => {
    checks.push({ check, didPass, detail: clip(detail) });
  };
  const skip = (check: string, detail: string): void => {
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
  add(
    "initialize",
    init.status === 200 &&
      typeof serverName === "string" &&
      serverName !== "" &&
      "tools" in capabilities,
    `${statusText(init)}, server ${typeof serverName === "string" ? serverName : "(none)"}, capabilities [${Object.keys(capabilities).join(", ")}]`,
  );
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
  add(
    "tools/list",
    toolsList.status === 200 && Array.isArray(toolsValue),
    `${statusText(toolsList)}, tools [${toolNames.join(", ")}]`,
  );
  for (const [index, tool] of tools.entries()) {
    const readOnly = asObject(tool.annotations).readOnlyHint;
    add(`readOnlyHint ${toolNames[index]}`, readOnly === true, `readOnlyHint=${String(readOnly)}`);
  }

  // 3. one tools/call per tool, only when asked.
  if (!options.call) {
    if (tools.length > 0) {
      skip(
        "tools/call",
        "not run: pass --call to call each tool once (a call can reach the network)",
      );
    }
  } else {
    for (const [index, tool] of tools.entries()) {
      const args = buildSampleArguments(tool.inputSchema);
      const call = await probe.rpc("tools/call", { name: toolNames[index], arguments: args });
      const result = asObject(call.message?.result);
      const content = asArray(result.content);
      const text = String(asObject(content[0]).text ?? "");
      const rpcError = call.message?.error;
      add(
        `tools/call ${toolNames[index]}`,
        call.status === 200 && !rpcError && result.isError !== true && content.length > 0,
        `${statusText(call)}, arguments ${JSON.stringify(args)}, ${rpcError ? `error ${JSON.stringify(rpcError)}` : `isError ${String(result.isError ?? false)}, text ${text}`}`,
      );
    }
  }

  // 4. prompts/list and one prompts/get per prompt. With no prompts capability, an empty list or an error is right.
  const promptsList = await probe.rpc("prompts/list");
  const promptsValue = asObject(promptsList.message?.result).prompts;
  const prompts = asArray(promptsValue).map(asObject);
  const promptNames = prompts.map((prompt) => String(prompt.name ?? "(unnamed)"));
  if (hasPrompts) {
    add(
      "prompts/list",
      promptsList.status === 200 && Array.isArray(promptsValue),
      `${statusText(promptsList)}, prompts [${promptNames.join(", ")}]`,
    );
  } else {
    const isRefused = promptsList.message !== null && "error" in promptsList.message;
    add(
      "prompts/list",
      promptsList.message !== null && (isRefused || prompts.length === 0),
      isRefused
        ? `no prompts capability; refused with ${JSON.stringify(promptsList.message?.error)}`
        : `no prompts capability; ${statusText(promptsList)}, prompts [${promptNames.join(", ")}]${prompts.length > 0 ? ", but initialize did not declare prompts" : ""}`,
    );
  }
  for (const [index, prompt] of prompts.entries()) {
    const args = buildPromptArguments(prompt.arguments);
    const get = await probe.rpc("prompts/get", { name: promptNames[index], arguments: args });
    const messages = asArray(asObject(get.message?.result).messages);
    add(
      `prompts/get ${promptNames[index]}`,
      get.status === 200 && messages.length > 0,
      `${statusText(get)}, arguments ${JSON.stringify(args)}, ${messages.length} message(s)${get.message?.error ? `, error ${JSON.stringify(get.message.error)}` : ""}`,
    );
  }

  // 5. protocol edges.
  const unknown = await probe.rpc("no/such_method");
  const unknownError = asObject(unknown.message?.error);
  add(
    "unknown method is refused (-32601)",
    unknownError.code === -32601,
    unknown.message?.error
      ? JSON.stringify(unknown.message.error)
      : `${statusText(unknown)}, no JSON-RPC error`,
  );

  const badJson = await probe.http(url, { body: "not json" });
  add(
    "bad JSON is refused (HTTP 400)",
    badJson.status === 400,
    `${statusText(badJson)} ${badJson.body.toString("utf8").slice(0, 120)}`,
  );

  const get = await probe.http(url, { method: "GET", accept: null });
  add("GET is refused (HTTP 405)", get.status === 405, statusText(get));

  const jsonOnly = await probe.rpc("tools/list", undefined, { accept: "application/json" });
  add(
    "a JSON-only Accept header is served (not 406)",
    jsonOnly.status !== 406 && jsonOnly.status !== 0,
    statusText(jsonOnly),
  );

  // 6. the icon a directory listing shows.
  if (iconUrl) {
    const icon = await probe.http(iconUrl, { method: "GET", accept: null });
    add(
      "icon-512.png is a PNG",
      icon.status === 200 && isPng(icon.body),
      `${iconUrl}: ${statusText(icon)}, ${icon.contentType || "no content-type"}${icon.status === 200 && !isPng(icon.body) ? ", not PNG bytes" : ""}`,
    );
  }

  return finish(url, iconUrl, typeof serverName === "string" ? serverName : null, checks);
}

function finish(
  url: string,
  iconUrl: string | null,
  serverName: string | null,
  checks: McpCheckResult[],
): McpCheckReport {
  const failures = checks.filter((check) => !check.didPass).length;
  return { url, iconUrl, serverName, didPass: failures === 0, failures, checks };
}