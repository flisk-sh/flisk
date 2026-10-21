// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { getMcpIndexTemplate, mcpBackendProvider } from "./mcp.js";

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
  });
});

describe("getMcpIndexTemplate", () => {
  const index = getMcpIndexTemplate("docs-mcp");

  it("names the service in the server, health response and startup log", () => {
    expect(index).toContain("new McpServer({ name: 'docs-mcp', version: '1.0.0' })");
    expect(index).toContain("{ status: 'ok', service: 'docs-mcp' }");
    expect(index).toContain("docs-mcp MCP server on http://localhost:");
  });

  it("registers a placeholder tool with a zod input schema", () => {
    expect(index).toContain("server.registerTool(");
    expect(index).toContain("'echo'");
    expect(index).toContain("inputSchema: { message: z.string() }");
  });

  it("serves health and a stateless streamable HTTP MCP endpoint", () => {
    expect(index).toContain("if (path === '/health')");
    expect(index).toContain("if (path === '/mcp')");
    expect(index).toContain("new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })");
    expect(index).toContain("await transport.handleRequest(req, res, await readBody(req));");
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

  it("binds beyond loopback on the injected port", () => {
    expect(index).toContain("const port = Number(process.env.PORT || 3000);");
    expect(index).toContain("httpServer.listen(port, '0.0.0.0'");
  });
});
