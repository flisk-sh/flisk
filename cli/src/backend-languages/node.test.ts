import { describe, expect, it } from "vitest";
import { nodeBackendProvider } from "./node.js";

function generatedServer(): string {
  const file = (nodeBackendProvider.createFiles?.("test-app") ?? []).find(
    (entry) => entry.filename === "src/index.js",
  );
  if (!file) throw new Error("missing generated Node backend server");
  return file.content;
}

describe("Node backend language module", () => {
  it("parses request paths without trusting the Host header", () => {
    const server = generatedServer();
    expect(server).toContain('new URL(req.url, "http://localhost")');
    expect(server).not.toContain("req.headers.host");
  });

  it("returns JSON 400 when request URL parsing fails", () => {
    const server = generatedServer();
    expect(server).toMatch(
      /try\s*\{\s*url = new URL\(req\.url, "http:\/\/localhost"\);\s*\} catch \{\s*return sendJson\(res, 400, \{ error: "Bad Request" \}\);\s*\}/,
    );
  });

  it("preserves the health and root response contracts", () => {
    const server = generatedServer();
    expect(server).toContain('url.pathname === "/health"');
    expect(server).toContain('url.pathname === "/"');
    expect(server).toContain('status: "ok", service: name');
  });
});
