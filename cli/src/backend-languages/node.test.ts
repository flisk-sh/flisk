import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeBackendProvider } from "./node.js";

/** Get the actual server source emitted by the Node backend scaffold. */
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

  it("rejects network-path and authority-changing request targets", () => {
    const server = generatedServer();
    expect(server).toContain('req.url?.startsWith("//")');
    expect(server).toContain('url.origin !== "http://localhost"');
  });

  it("preserves the health and root response contracts", () => {
    const server = generatedServer();
    expect(server).toContain('url.pathname === "/health"');
    expect(server).toContain('url.pathname === "/"');
    expect(server).toContain('status: "ok", service: name');
  });

  it("passes the generated backend's HTTP regression tests", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-node-backend-"));
    try {
      for (const file of nodeBackendProvider.createFiles?.("test-app") ?? []) {
        const path = join(dir, file.filename);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, file.content);
      }

      const result = spawnSync(process.execPath, ["--test", "tests/health.test.js"], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
        timeout: 20_000,
      });
      expect(result.error, result.stderr).toBeUndefined();
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 25_000);
});
