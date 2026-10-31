// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { portFromEnv } from "../utils/generated-port.js";
import {
  getMcpIndexTemplate,
  getMcpTestTemplate,
  MCP_ICON_512_PNG_BASE64,
  mcpBackendProvider,
} from "./mcp.js";

describe("mcp backend provider", () => {
  it("describes the fixed Bun Model Context Protocol scaffold", () => {
    expect(mcpBackendProvider.id).toBe("mcp");
    expect(mcpBackendProvider.label).toBe("Bun + Model Context Protocol server");
    expect(mcpBackendProvider.dependencies).toEqual({
      "@modelcontextprotocol/sdk": "^1.32.0",
      zod: "^4.0.0",
    });
    expect(mcpBackendProvider.devDependencies).toEqual({});
    expect(mcpBackendProvider.createIndex).toBe(getMcpIndexTemplate);
    expect(mcpBackendProvider.createTest).toBe(getMcpTestTemplate);
  });
});

describe("getMcpIndexTemplate", () => {
  const index = getMcpIndexTemplate("docs-mcp");

  it("names the service in the server, health response and startup log", () => {
    expect(index).toContain("new McpServer({\n    name: 'docs-mcp',\n    version: '1.0.0',");
    expect(index).toContain("{ status: 'ok', service: 'docs-mcp' }");
    expect(index).toContain("docs-mcp MCP server on http://localhost:");
  });

  it("registers a placeholder tool with a zod input schema", () => {
    expect(index).toContain("server.registerTool(");
    expect(index).toContain("'echo'");
    expect(index).toContain("inputSchema: { message: z.string() }");
  });

  it("annotates the placeholder tool as read-only, non-destructive, idempotent and closed-world", () => {
    expect(index).toContain(
      "annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }",
    );
  });

  it("registers a sample prompt next to the sample tool, so prompts/list returns it", () => {
    expect(index).toContain("server.registerPrompt(");
    expect(index).toContain("'echo_message'");
    expect(index).toContain("argsSchema: { message: z.string() }");
    expect(index).toContain("Call the echo tool with this message: ");
  });

  it("serves a bundled 512 px PNG icon at /icon-512.png", () => {
    expect(index).toContain("if (path === '/icon-512.png')");
    expect(index).toContain("res.setHeader('content-type', 'image/png');");
    expect(index).toContain(`'${MCP_ICON_512_PNG_BASE64}'`);

    const png = Buffer.from(MCP_ICON_512_PNG_BASE64, "base64");
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    // IHDR width and height.
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
    expect(png.length).toBeLessThan(4096);

    // Every chunk's CRC matches and the pixel data inflates to 512 rows of a filter byte plus 512 palette indexes.
    let offset = 8;
    const types: string[] = [];
    let idat = Buffer.alloc(0);
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const typeAndData = png.subarray(offset + 4, offset + 8 + length);
      expect(png.readUInt32BE(offset + 8 + length)).toBe(crc32(typeAndData));
      const type = typeAndData.subarray(0, 4).toString("latin1");
      types.push(type);
      if (type === "IDAT") idat = Buffer.concat([idat, typeAndData.subarray(4)]);
      offset += 12 + length;
    }
    expect(types).toEqual(["IHDR", "PLTE", "IDAT", "IEND"]);
    expect(inflateSync(idat).length).toBe(512 * (512 + 1));
  });

  it("serves health and a stateless streamable HTTP MCP endpoint", () => {
    expect(index).toContain("if (path === '/health')");
    expect(index).toContain("if (path === '/mcp')");
    expect(index).toContain("new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })");
    expect(index).toContain("body = await readBody(req);");
    expect(index).toContain("code: -32700, message: 'Parse error'");
    expect(index).toContain("await transport.handleRequest(req, res, body);");
  });

  it("answers non-POST MCP requests with 405 and unknown paths with 404", () => {
    expect(index).toContain("if (req.method !== 'POST')");
    expect(index).toContain("res.statusCode = 405;");
    expect(index).toContain("res.setHeader('allow', 'POST');");
    expect(index).toContain("res.statusCode = 404;");
    expect(index).toContain("error: 'not_found'");
  });

  it("closes the transport and server when the request ends", () => {
    expect(index).toContain("res.on('close', () => {");
    expect(index).toContain("transport.close();");
    expect(index).toContain("server.close();");
  });

  it("binds beyond loopback on the injected port, only when run as the entry point", () => {
    expect(index).toContain(portFromEnv());
    expect(index).not.toContain("VITEST");
    expect(index.match(/httpServer\.listen\(/g)).toHaveLength(1);
    const guard = index.indexOf("if (isEntryPoint()) {");
    expect(guard).toBeGreaterThan(-1);
    expect(index.indexOf("httpServer.listen(port, '0.0.0.0'")).toBeGreaterThan(guard);
    expect(index).toContain("imported as a module, not listening");
  });

  it("listens when run directly and not when imported", () => {
    const start = index.indexOf("function isEntryPoint()");
    const end = index.indexOf("\n}\n", start) + 3;
    const dir = mkdtempSync(join(tmpdir(), "mcp-entry-"));
    try {
      writeFileSync(
        join(dir, "entry.mjs"),
        "import { realpathSync } from 'node:fs';\nimport { fileURLToPath } from 'node:url';\n" +
          index.slice(start, end) +
          "\nconsole.log('entry=' + isEntryPoint());\n",
      );
      writeFileSync(join(dir, "importer.mjs"), "await import('./entry.mjs');\n");
      expect(
        execFileSync(process.execPath, [join(dir, "entry.mjs")], { encoding: "utf8" }),
      ).toContain("entry=true");
      expect(
        execFileSync(process.execPath, [join(dir, "importer.mjs")], { encoding: "utf8" }),
      ).toContain("entry=false");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("advertises the icon in serverInfo.icons", () => {
    expect(index).toContain(
      "icons: [{ src: '/icon-512.png', mimeType: 'image/png', sizes: ['512x512'] }]",
    );
  });

  it("exports the HTTP server for the protocol test and keeps the server factory private", () => {
    expect(index).toContain("export const httpServer = createServer(");
    expect(index).toContain("\nfunction buildServer()");
    expect(index).not.toContain("export function buildServer");
  });
});

describe("getMcpTestTemplate", () => {
  const test = getMcpTestTemplate("docs-mcp");

  it("starts the generated server on a port from the OS", () => {
    expect(test).toContain("import { httpServer } from '../src/index';");
    expect(test).toContain("httpServer.listen(0, '127.0.0.1', resolve)");
    expect(test).toContain("httpServer.close(");
  });

  it("checks the advertised icon in the initialize result", () => {
    expect(test).toContain("expect(result.serverInfo.icons).toEqual(");
  });

  it("calls initialize, tools/list, prompts/list and one tools/call over /mcp", () => {
    expect(test).toContain("fetch(baseUrl + '/mcp', {");
    expect(test).toContain("rpc('initialize', {");
    expect(test).toContain("expect(result.serverInfo.name).toBe('docs-mcp');");
    expect(test).toContain("rpc('tools/list')");
    expect(test).toContain("rpc('prompts/list')");
    expect(test).toContain("rpc('tools/call', { name: 'echo', arguments: { message: 'hello' } })");
  });

  it("checks the tool annotations, the 405 on GET /mcp and the icon", () => {
    expect(test).toContain("expect(echo.annotations).toEqual({");
    expect(test).toContain("expect(res.status).toBe(405);");
    expect(test).toContain("expect(res.headers.get('allow')).toBe('POST');");
    expect(test).toContain("fetch(baseUrl + '/icon-512.png')");
  });

  it("reads the JSON-RPC response from the server-sent event's data line", () => {
    expect(test).toContain("line.startsWith('data: ')");
  });
});
