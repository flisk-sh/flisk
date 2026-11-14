import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { NODE_DEV_COMMAND, nodeBackendProvider } from "./node.js";

/** Get the actual server source emitted by the Node backend scaffold. */
function generatedServer(): string {
  const file = (nodeBackendProvider.createFiles?.("test-app") ?? []).find(
    (entry) => entry.filename === "src/index.js",
  );
  if (!file) throw new Error("missing generated Node backend server");
  return file.content;
}

/** Get a generated file by its filename. */
function generatedFile(filename: string): string {
  const file = (nodeBackendProvider.createFiles?.("test-app") ?? []).find(
    (entry) => entry.filename === filename,
  );
  if (!file) throw new Error(`missing generated file ${filename}`);
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

describe("Node backend provider contract", () => {
  const files = nodeBackendProvider.createFiles?.("test-app") ?? [];

  it("exposes the expected provider metadata", () => {
    expect(nodeBackendProvider.id).toBe("node");
    expect(nodeBackendProvider.label).toBe("Node.js 22");
    expect(nodeBackendProvider.devCommand).toBe(NODE_DEV_COMMAND);
    expect(NODE_DEV_COMMAND).toBe("node --watch src/index.js");
  });

  it("configures the expected watch pattern", () => {
    expect(nodeBackendProvider.watch).toEqual(["src/**/*"]);
  });

  it("generates the expected configuration and source files", () => {
    expect(files.map((file) => file.filename)).toEqual([
      "package.json",
      "package-lock.json",
      "src/index.js",
      "tests/health.test.js",
    ]);
  });

  it("generates valid and consistent package manifests", () => {
    const packageJson = JSON.parse(generatedFile("package.json"));
    const packageLock = JSON.parse(generatedFile("package-lock.json"));

    expect(packageJson.name).toBe("test-app");
    expect(packageJson.type).toBe("module");
    expect(packageLock.name).toBe("test-app");
    expect(packageLock.packages[""].name).toBe("test-app");
  });

  it("uses the supplied project name and generates the health route", () => {
    const server = generatedFile("src/index.js");

    expect(server).toContain('const name = "test-app"');
    expect(server).toContain('url.pathname === "/health"');
    expect(server).toContain('{ status: "ok", service: name }');
  });

  it("generates a health test that expects the project name", () => {
    const healthTest = generatedFile("tests/health.test.js");

    expect(healthTest).toContain(`fetch(\`\${baseUrl}/health\`)`);
    expect(healthTest).toContain('{ status: "ok", service: "test-app" }');
  });

  it("does not generate empty files", () => {
    for (const file of files) {
      expect(file.content.trim(), file.filename).not.toBe("");
    }
  });
});
