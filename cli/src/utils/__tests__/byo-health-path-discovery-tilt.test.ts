// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const discoveryLoading = join(repoRoot, "discovery/loading.star");
const hasTilt = spawnSync("tilt", ["version"], { encoding: "utf-8" }).status === 0;

if (process.env.TDK_REQUIRE_TILT === "1" && !hasTilt) {
  throw new Error("Tilt is required for the health-path discovery Starlark tests in CI.");
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Loads one service.json the way `flisk up` does for the compose and Dockerfile generators
 * (Manifest.load_manifest, see prepare_resource_manifests; ManifestParser.normalize is not on that path)
 * and returns the healthCheckPath they receive, or Tilt's error.
 */
function discoverHealthCheckPath(manifest: Record<string, unknown>) {
  const project = mkdtempSync(join(tmpdir(), "tdk-health-path-"));
  dirs.push(project);
  const serviceDir = join(project, "services/product/shop/api");
  mkdirSync(serviceDir, { recursive: true });
  writeFileSync(join(serviceDir, "service.json"), JSON.stringify(manifest));
  writeFileSync(join(serviceDir, "Dockerfile"), "FROM scratch\n");
  const out = join(project, "health.txt");
  writeFileSync(
    join(project, "Tiltfile"),
    `load(${JSON.stringify(discoveryLoading)}, "Manifest")
manifest = Manifest.load_manifest("services/product/shop/api")
local('cat > ' + ${JSON.stringify(JSON.stringify(out))}, quiet = True, stdin = repr(manifest.get('healthCheckPath')))
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
    healthCheckPath: result.status === 0 ? readFileSync(out, "utf-8") : "",
  };
}

const base = { appName: "api", stack: "shop", schemaVersion: 1, port: 4000 };

// compose.star and l4_runtime_layers.star treat a missing healthCheckPath on a bring-your-own service as "serves no HTTP":
// no HTTP probe, no Traefik health labels. That only works if discovery does not invent /health for it.
describe.skipIf(!hasTilt)("Tilt discovery of healthCheckPath", { timeout: 60_000 }, () => {
  it("gives a backend the default /health", () => {
    const result = discoverHealthCheckPath({ ...base, appType: "backend" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.healthCheckPath).toBe('"/health"');
  });

  it("does not invent a path for a bring-your-own service without one", () => {
    const result = discoverHealthCheckPath({
      ...base,
      appType: "bring-your-own",
      dockerfile: "Dockerfile",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.healthCheckPath).toBe("None");
  });

  it("keeps the path a bring-your-own service declares", () => {
    const result = discoverHealthCheckPath({
      ...base,
      appType: "bring-your-own",
      dockerfile: "Dockerfile",
      healthCheckPath: "/status",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.healthCheckPath).toBe('"/status"');
  });
});
