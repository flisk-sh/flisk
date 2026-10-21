// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const orchestrator = join(repoRoot, "discovery/discovery_orchestrator.star");
const hasTilt = spawnSync("tilt", ["version"], { encoding: "utf-8" }).status === 0;

if (process.env.TDK_REQUIRE_TILT === "1" && !hasTilt) {
  throw new Error("Tilt is required for the service.json injection Starlark tests in CI.");
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Runs Tilt's own discovery over a project with one service.json and returns the discovered ports, or Tilt's error. */
function discover(manifest: Record<string, unknown>) {
  const project = mkdtempSync(join(tmpdir(), "flisk-ghsa-phgf-"));
  dirs.push(project);
  const serviceDir = join(project, "services/product/shop/api");
  mkdirSync(serviceDir, { recursive: true });
  writeFileSync(join(serviceDir, "service.json"), JSON.stringify(manifest));
  const out = join(project, "ports.txt");
  writeFileSync(
    join(project, "Tiltfile"),
    `load(${JSON.stringify(orchestrator)}, "initialize_discovery")
cache = {}
initialize_discovery(cache)
ports = [r.get('port') for app in cache.get('app_resources', []) for r in app.get('resources', [])]
local('cat > ' + ${JSON.stringify(JSON.stringify(out))}, quiet = True, stdin = repr(ports))
`,
  );
  const result = spawnSync("tilt", ["alpha", "tiltfile-result", "-f", join(project, "Tiltfile")], {
    cwd: project,
    encoding: "utf-8",
    env: { ...process.env, TDK_PROJECT_ROOT: project },
    timeout: 30_000,
  });
  return {
    status: result.status,
    stderr: result.stderr,
    ports: result.status === 0 ? readFileSync(out, "utf-8") : "",
  };
}

const base = {
  appName: "api",
  appType: "backend",
  stack: "shop",
  schemaVersion: 1,
  traefik: { pathPrefix: "/api/v1/shop" },
};

// GHSA-phgf-pww4-7jxc: `tilt up` reads service.json without the CLI, so discovery itself must refuse values that would add keys
// to the generated compose file.
describe.skipIf(!hasTilt)(
  "Tilt discovery of unsafe service.json values",
  { timeout: 60_000 },
  () => {
    it("discovers a clean service", () => {
      const result = discover({ ...base, port: 4000 });
      expect(result.status, result.stderr).toBe(0);
      expect(result.ports).toBe("[4000]");
    });

    it.each([
      ["port", { port: "4000\n    privileged: true" }],
      ["dockerfile", { appType: "bring-your-own", dockerfile: "Dockerfile\n    privileged: true" }],
      ["healthCheckPath", { healthCheckPath: "/health\n    privileged: true" }],
    ])("refuses a line break in %s", (field, extra) => {
      const result = discover({ ...base, ...extra });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`MANIFEST ERROR: '${field}'`);
      expect(result.stderr).not.toContain("privileged: true");
    });
  },
);
