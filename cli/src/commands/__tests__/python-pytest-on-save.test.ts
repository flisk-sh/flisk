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
const hasPytest = (() => {
  try {
    const res = spawnSync("python3", ["-m", "pytest", "--version"], { encoding: "utf-8" });
    return res.status === 0;
  } catch {
    return false;
  }
})();

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
    const resNull = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: null } },
      "service.json",
    );
    expect(resNull.errors).toContain(
      'service.json.dev.testOnSave: expected true or false, or an object such as { "enabled": true, "path": "tests" }',
    );

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

  it("rejects invalid properties and unknown keys inside dev.testOnSave object", () => {
    const resNullEnabled = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: { enabled: null } } },
      "service.json",
    );
    expect(resNullEnabled.errors).toContain(
      "service.json.dev.testOnSave.enabled: expected true or false",
    );

    const resBadEnabled = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: { enabled: "yes" } } },
      "service.json",
    );
    expect(resBadEnabled.errors).toContain(
      "service.json.dev.testOnSave.enabled: expected true or false",
    );

    const resNullPath = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: { path: null } } },
      "service.json",
    );
    expect(resNullPath.errors).toContain(
      "service.json.dev.testOnSave.path: expected a non-empty string path such as 'tests'",
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

    const resUnknownKey = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: { enabled: true, extraKey: "unexpected" } } },
      "service.json",
    );
    expect(resUnknownKey.errors).toContain(
      'service.json.dev.testOnSave: unexpected key "extraKey" (expected "enabled" or "path")',
    );

    const resMisspelledKey = validateServiceManifest(
      { ...validManifest, dev: { testOnSave: { enable: false } } },
      "service.json",
    );
    expect(resMisspelledKey.errors).toContain(
      'service.json.dev.testOnSave: unexpected key "enable" (expected "enabled" or "path")',
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
    expect(testManifest.DeployTarget.AllowParallel).toBe(false);
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

  it("handles resource name collision by suffixing with -pytest when <service>-test exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-tilt-collision-"));
    dirs.push(dir);
    const tiltfilePath = join(dir, "Tiltfile");

    writeFileSync(
      tiltfilePath,
      `load('${repoRoot}/runtime/engine/topologies/platform/docker/index.star', 'Docker')
load('${repoRoot}/runtime/engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star', 'register_python_test_resource')

config_collision = {
    'res_name': 'api-backend',
    'res_path': 'services/shop/api',
    'labels': ['app.api-backend'],
    'manifest': {
        'language': 'python',
        'appType': 'backend',
        'dev': {'testOnSave': True},
    },
    'all_services': {'api-backend-test': True},
}

local_resource('api-backend', cmd=['true'])
register_python_test_resource(config_collision, 'services/shop', 'flisk-shop', True)
`,
    );

    const tiltResult = spawnSync("tilt", ["alpha", "tiltfile-result", "-f", tiltfilePath], {
      encoding: "utf-8",
      timeout: 30_000,
    });
    expect(tiltResult.status, tiltResult.stderr).toBe(0);
    const parsed = JSON.parse(tiltResult.stdout);
    const testManifest = parsed.Manifests.find(
      (m: { Name: string }) => m.Name === "api-backend-pytest",
    );
    expect(testManifest).toBeDefined();
    expect(testManifest.DeployTarget.AllowParallel).toBe(false);
  });
});

describe("python test container diagnostics and execution safety", () => {
  it("handles missing pytest in container with actionable error guidance using generated cmd", () => {
    const dir = mkdtempSync(join(tmpdir(), "flisk-tilt-diag-"));
    dirs.push(dir);
    const tiltfilePath = join(dir, "Tiltfile");

    writeFileSync(
      tiltfilePath,
      `load('${repoRoot}/runtime/engine/topologies/platform/docker/index.star', 'Docker')
load('${repoRoot}/runtime/engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star', 'register_python_test_resource')

config = {
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
register_python_test_resource(config, 'services/shop', 'flisk-shop', True)
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

    // Verify generated shell script handles stopped container, non-existent test dir, and missing pytest
    const cmdArgs = testManifest.DeployTarget.UpdateCmdSpec.args;
    expect(cmdArgs[0]).toBe("sh");
    expect(cmdArgs[1]).toBe("-c");

    const mockBinDir = join(dir, "bin");
    mkdirSync(mockBinDir, { recursive: true });
    const mockDocker = join(mockBinDir, "docker");

    // 1. Mock docker when container is not running (ps prints nothing)
    writeFileSync(
      mockDocker,
      `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "ps" ]; then
    exit 0
  fi
done
exit 0
`,
      { mode: 0o755 },
    );

    const runStopped = spawnSync(cmdArgs[0], cmdArgs.slice(1), {
      cwd: dir,
      env: { ...process.env, PATH: `${mockBinDir}:${process.env.PATH}` },
      encoding: "utf-8",
    });
    expect(runStopped.status).toBe(0);
    expect(runStopped.stdout).toContain(
      "Container api-backend is not currently running; skipping pytest",
    );

    // 2. Mock docker when container is running but test directory does not exist on host
    writeFileSync(
      mockDocker,
      `#!/bin/sh
for arg in "$@"; do
  if [ "$arg" = "ps" ]; then
    echo "mock-container-id-1234"
    exit 0
  fi
done
exit 0
`,
      { mode: 0o755 },
    );

    const runMissingHostDir = spawnSync(cmdArgs[0], cmdArgs.slice(1), {
      cwd: dir,
      env: { ...process.env, PATH: `${mockBinDir}:${process.env.PATH}` },
      encoding: "utf-8",
    });
    expect(runMissingHostDir.status).toBe(0);
    expect(runMissingHostDir.stdout).toContain("Test path 'tests' does not exist; skipping pytest");

    // 3. Mock docker when container is running, test directory exists on host, but pytest is not in container
    const testHostDir = join(dir, cmdArgs[8]);
    mkdirSync(testHostDir, { recursive: true });

    writeFileSync(
      mockDocker,
      `#!/bin/sh
is_exec=0
for arg in "$@"; do
  if [ "$arg" = "ps" ]; then
    echo "mock-container-id-1234"
    exit 0
  fi
  if [ "$arg" = "cp" ]; then
    exit 0
  fi
  if [ "$arg" = "exec" ]; then
    is_exec=1
  fi
done
if [ "$is_exec" -eq 1 ]; then
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "sh" ] && [ "$2" = "-c" ]; then
      shift 2
      exec env PATH="/usr/bin:/bin" sh -c "$@"
    fi
    shift
  done
fi
exit 0
`,
      { mode: 0o755 },
    );

    const runMissingPytest = spawnSync(cmdArgs[0], cmdArgs.slice(1), {
      cwd: dir,
      env: { ...process.env, PATH: `${mockBinDir}:${process.env.PATH}` },
      encoding: "utf-8",
    });
    expect(runMissingPytest.status).toBe(1);
    expect(runMissingPytest.stdout).toContain(
      "Error: pytest is not installed in container api-backend.",
    );
    expect(runMissingPytest.stdout).toContain(
      "Hint: Add pytest to pyproject.toml dev dependencies",
    );
  });
});

describe.skipIf(!hasPytest)(
  "python dev loop simulated runner: PASS -> FAIL -> FIX -> PASS execution cycle",
  () => {
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
  },
);
