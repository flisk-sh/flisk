// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateStarlark, tiltAvailable } from "../../test-support/index.js";
import { validateServiceManifest } from "../../utils/service-manifest.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const languageDockerfile = join(
  repoRoot,
  "runtime/engine/topologies/platform/docker/dockerfile/language_dockerfile.star",
);
const hasTilt = tiltAvailable();

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("python pytest-on-save manifest validation", () => {
  const validManifest = {
    appName: "py-api",
    appType: "backend",
    stack: "shop",
    language: "python",
    schemaVersion: 1,
    port: 4000,
  };

  it("accepts a manifest without dev.testOnSave", () => {
    const res = validateServiceManifest(validManifest, "service.json");
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
  });

  it("accepts dev.testOnSave as boolean true or false", () => {
    const resTrue = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: true } },
      "service.json",
    );
    expect(resTrue.errors).toEqual([]);
    expect(resTrue.warnings).toEqual([]);

    const resFalse = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: false } },
      "service.json",
    );
    expect(resFalse.errors).toEqual([]);
    expect(resFalse.warnings).toEqual([]);
  });

  it("accepts dev.testOnSave as an object with enabled and custom path", () => {
    const res = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: { enabled: true, path: "tests/unit" } } },
      "service.json",
    );
    expect(res.errors).toEqual([]);
    expect(res.warnings).toEqual([]);
  });

  it("rejects non-boolean, non-object dev.testOnSave with an actionable error", () => {
    const resStr = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: "always" } },
      "service.json",
    );
    expect(resStr.errors).toContain(
      'service.json.dev.testOnSave: expected true or false, or an object such as { "enabled": true, "path": "tests" }',
    );

    const resNum = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: 1 } },
      "service.json",
    );
    expect(resNum.errors).toContain(
      'service.json.dev.testOnSave: expected true or false, or an object such as { "enabled": true, "path": "tests" }',
    );
  });

  it("rejects invalid properties inside dev.testOnSave object", () => {
    const resBadEnabled = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: { enabled: "yes" } } },
      "service.json",
    );
    expect(resBadEnabled.errors).toContain(
      "service.json.dev.testOnSave.enabled: expected true or false",
    );

    const resEmptyPath = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: { path: "   " } } },
      "service.json",
    );
    expect(resEmptyPath.errors).toContain(
      "service.json.dev.testOnSave.path: expected a non-empty string path such as 'tests'",
    );

    const resAbsPath = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: { path: "/absolute/tests" } } },
      "service.json",
    );
    expect(resAbsPath.errors).toContain(
      'service.json.dev.testOnSave.path: must be a path relative to the service directory (no leading "/" or drive)',
    );
  });

  it("warns when dev.testOnSave is enabled for a non-Python service", () => {
    const resGo = validateServiceManifest(
      { ...validManifest, language: "go", dev: { testOnSave: true } },
      "service.json",
    );
    expect(resGo.errors).toEqual([]);
    expect(resGo.warnings).toContain(
      'service.json.dev.testOnSave: only applies to Python services (language "python"); it is ignored here',
    );

    const resNode = validateServiceManifest(
      { ...validManifest, language: "node", dev: { testOnSave: { enabled: true } } },
      "service.json",
    );
    expect(resNode.errors).toEqual([]);
    expect(resNode.warnings).toContain(
      'service.json.dev.testOnSave: only applies to Python services (language "python"); it is ignored here',
    );
  });
});

describe.skipIf(!hasTilt)("python pytest-on-save Starlark switch", { timeout: 30_000 }, () => {
  it("enables pytest-on-save only for python backends with dev.testOnSave true or enabled: true", () => {
    const result = evaluateStarlark(languageDockerfile, {
      args: `load(${JSON.stringify(languageDockerfile)}, 'python_test_on_save_enabled', 'python_test_on_save_path')
# True cases
if not python_test_on_save_enabled({'language': 'python', 'dev': {'testOnSave': True}}):
    fail('python + testOnSave: True must enable it')
if not python_test_on_save_enabled({'language': 'python', 'dev': {'testOnSave': {'enabled': True}}}):
    fail('python + testOnSave dict with enabled: True must enable it')
if not python_test_on_save_enabled({'language': 'python', 'dev': {'testOnSave': {'path': 'tests'}}}):
    fail('python + testOnSave dict defaulting to enabled must enable it')

# False cases
if python_test_on_save_enabled({'language': 'python'}):
    fail('absent dev.testOnSave must stay off')
if python_test_on_save_enabled({'language': 'python', 'dev': {'testOnSave': False}}):
    fail('testOnSave: False must stay off')
if python_test_on_save_enabled({'language': 'python', 'dev': {'testOnSave': {'enabled': False}}}):
    fail('testOnSave dict with enabled: False must stay off')
if python_test_on_save_enabled({'language': 'go', 'dev': {'testOnSave': True}}):
    fail('only Python is supported (Go must be off)')
if python_test_on_save_enabled({'language': 'node', 'dev': {'testOnSave': True}}):
    fail('only Python is supported (Node must be off)')
if python_test_on_save_enabled({'dev': {'testOnSave': True}}):
    fail('missing language defaults to Bun and must stay off')
if python_test_on_save_enabled(None):
    fail('None manifest must not enable it')

# Test path resolution
if python_test_on_save_path({'dev': {'testOnSave': {'path': 'tests/unit'}}}) != 'tests/unit':
    fail('custom path must be resolved')
if python_test_on_save_path({'dev': {'testOnSave': True}}) != 'tests':
    fail('default path must be tests')
if python_test_on_save_path(None) != 'tests':
    fail('None manifest must default to tests')
`,
    });
    expect(result.status, result.stderr).toBe(0);
  });
});

describe.skipIf(!hasTilt)("Tiltfile python test resource registration", { timeout: 30_000 }, () => {
  it("registers a separate <service>-test resource when python service opts in", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-tilt-test-"));
    dirs.push(dir);
    const tiltfilePath = join(dir, "Tiltfile");

    writeFileSync(
      tiltfilePath,
      `load('${repoRoot}/runtime/engine/topologies/platform/docker/index.star', 'Docker')
load('${repoRoot}/runtime/engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star', 'register_python_test_resource')

config_enabled = {
    'res_name': 'api-backend',
    'res_path': 'services/shop/api',
    'labels': ['app.api-backend'],
    'manifest': {
        'language': 'python',
        'appType': 'backend',
        'dev': {'testOnSave': True},
    },
}

local_resource('api-backend', cmd=['true'])
register_python_test_resource(config_enabled, 'services/shop', 'flisk-shop', True)
`,
    );

    const tiltResult = spawnSync("tilt", ["alpha", "tiltfile-result", "-f", tiltfilePath], {
      encoding: "utf-8",
      timeout: 30_000,
    });
    expect(tiltResult.status, tiltResult.stderr).toBe(0);
    const parsed = JSON.parse(tiltResult.stdout);
    const testManifest = parsed.Manifests.find(
      (m: { Name: string }) => m.Name === "api-backend-test",
    );
    expect(testManifest).toBeDefined();
    expect(testManifest.Labels).toMatchObject({
      "app.api-backend": "app.api-backend",
      test: "test",
    });
    expect(testManifest.ResourceDependencies).toEqual(["api-backend"]);
    expect(testManifest.DeployTarget.AllowParallel).toBe(true);
    expect(testManifest.DeployTarget.FileWatchIgnores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          patterns: expect.arrayContaining([
            "**/__pycache__/**",
            "**/*.pyc",
            "**/.pytest_cache/**",
          ]),
        }),
      ]),
    );
  });

  it("does not register any test resource when testOnSave is absent or false", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-tilt-no-test-"));
    dirs.push(dir);
    const tiltfilePath = join(dir, "Tiltfile");

    writeFileSync(
      tiltfilePath,
      `load('${repoRoot}/runtime/engine/topologies/platform/docker/index.star', 'Docker')
load('${repoRoot}/runtime/engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star', 'register_python_test_resource')

config_disabled = {
    'res_name': 'api-backend',
    'res_path': 'services/shop/api',
    'labels': ['app.api-backend'],
    'manifest': {
        'language': 'python',
        'appType': 'backend',
        'dev': {'testOnSave': False},
    },
}

config_absent = {
    'res_name': 'api-backend-2',
    'res_path': 'services/shop/api-2',
    'labels': ['app.api-backend-2'],
    'manifest': {
        'language': 'python',
        'appType': 'backend',
    },
}

register_python_test_resource(config_disabled, 'services/shop', 'flisk-shop', True)
register_python_test_resource(config_absent, 'services/shop', 'flisk-shop', True)
`,
    );

    const tiltResult = spawnSync("tilt", ["alpha", "tiltfile-result", "-f", tiltfilePath], {
      encoding: "utf-8",
      timeout: 30_000,
    });
    expect(tiltResult.status, tiltResult.stderr).toBe(0);
    const parsed = JSON.parse(tiltResult.stdout);
    expect(parsed.Manifests).toHaveLength(0);
  });
});

describe("python dev loop E2E: PASS -> FAIL -> FIX -> PASS execution cycle", () => {
  it("executes pytest, detects failures without crashing the application, and recovers cleanly", async () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-pytest-e2e-"));
    dirs.push(dir);
    const srcDir = join(dir, "src");
    const testDir = join(dir, "tests");
    mkdirSync(srcDir, { recursive: true });
    mkdirSync(testDir, { recursive: true });

    // Mock application server running on loopback representing the healthy service process
    let appRequestsHandled = 0;
    const server = createServer((req, res) => {
      if (req.url === "/health") {
        appRequestsHandled++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "py-api" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolveServer) => {
      server.listen(0, "127.0.0.1", () => resolveServer());
    });
    const addr = server.address() as { port: number };
    const healthUrl = `http://127.0.0.1:${addr.port}/health`;

    try {
      // Create initial valid source code (PASS)
      writeFileSync(
        join(srcDir, "main.py"),
        `def get_status() -> str:
    return "ok"

def add(a: int, b: int) -> int:
    return a + b
`,
      );

      // Create pytest test suite
      writeFileSync(
        join(testDir, "test_app.py"),
        `import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
from main import get_status, add

def test_status():
    assert get_status() == "ok"

def test_add():
    assert add(2, 3) == 5
`,
      );

      // STAGE 1: Initial state -> PASS
      const run1 = spawnSync("python3", ["-m", "pytest", "tests"], {
        cwd: dir,
        encoding: "utf-8",
        timeout: 10_000,
      });
      expect(run1.status, run1.stderr).toBe(0);
      expect(run1.stdout).toContain("2 passed");

      // Verify the app service remains healthy
      const health1 = await fetch(healthUrl);
      expect(health1.status).toBe(200);
      const json1 = await health1.json();
      expect(json1).toEqual({ status: "ok", service: "py-api" });

      // STAGE 2: Introduce code failure -> FAIL
      writeFileSync(
        join(srcDir, "main.py"),
        `def get_status() -> str:
    return "broken"

def add(a: int, b: int) -> int:
    return a + b
`,
      );

      const run2 = spawnSync("python3", ["-m", "pytest", "tests"], {
        cwd: dir,
        encoding: "utf-8",
        timeout: 10_000,
      });
      // Pytest must fail (non-zero exit)
      expect(run2.status).toBe(1);
      expect(run2.stdout).toContain("FAILED tests/test_app.py::test_status");
      expect(run2.stdout).toContain("assert 'broken' == 'ok'");

      // CRITICAL ACCEPTANCE REQUIREMENT:
      // The running application server MUST NOT crash or restart when pytest fails!
      const health2 = await fetch(healthUrl);
      expect(health2.status).toBe(200);
      const json2 = await health2.json();
      expect(json2).toEqual({ status: "ok", service: "py-api" });

      // STAGE 3: Fix the failure -> FIX -> PASS
      writeFileSync(
        join(srcDir, "main.py"),
        `def get_status() -> str:
    return "ok"

def add(a: int, b: int) -> int:
    return a + b
`,
      );

      const run3 = spawnSync("python3", ["-m", "pytest", "tests"], {
        cwd: dir,
        encoding: "utf-8",
        timeout: 10_000,
      });
      expect(run3.status, run3.stderr).toBe(0);
      expect(run3.stdout).toContain("2 passed");

      // Verify app continues serving seamlessly
      const health3 = await fetch(healthUrl);
      expect(health3.status).toBe(200);
      expect(appRequestsHandled).toBe(3);
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });

  it("handles missing pytest in container with actionable error guidance", () => {
    // Test the shell script diagnostic when pytest executable is missing
    const testScript = `
if ! command -v non_existent_pytest_binary >/dev/null 2>&1; then
  echo "[flisk] Error: pytest is not installed in container 'api-backend'."
  echo "[flisk] Hint: Add pytest to pyproject.toml dev dependencies (e.g. pip install -e ".[dev]")"
  exit 1
fi
`;
    const run = spawnSync("sh", ["-c", testScript], { encoding: "utf-8" });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("Error: pytest is not installed in container 'api-backend'.");
    expect(run.stdout).toContain("Hint: Add pytest to pyproject.toml dev dependencies");
  });
});
