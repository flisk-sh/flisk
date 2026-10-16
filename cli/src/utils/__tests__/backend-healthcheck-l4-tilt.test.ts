// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const l4Layers = join(repoRoot, "engine/topologies/platform/docker/layers/l4_runtime_layers.star");
const hasTilt = spawnSync("tilt", ["version"], { encoding: "utf-8" }).status === 0;

if (process.env.TDK_REQUIRE_TILT === "1" && !hasTilt) {
  throw new Error("Tilt is required for the backend HEALTHCHECK Starlark tests in CI.");
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Renders the non-golden L4 backend stage with the manifest the Dockerfile generator passes
 * (manifest_resource.star calls Docker.backend with `manifest` but no `port`) and returns its HEALTHCHECK instruction.
 */
function renderHealthcheck(manifest: Record<string, unknown>) {
  const project = mkdtempSync(join(tmpdir(), "tdk-l4-healthcheck-"));
  dirs.push(project);
  mkdirSync(join(project, "services/app/api"), { recursive: true });
  writeFileSync(
    join(project, "services/app/api/package.json"),
    '{"scripts":{"start":"bun run dist/index.js"}}',
  );
  const out = join(project, "dockerfile.txt");
  writeFileSync(
    join(project, "Tiltfile"),
    `load(${JSON.stringify(l4Layers)}, "L4_generate_backend_runtime")
manifest = decode_json(${JSON.stringify(JSON.stringify(manifest))})
stage = L4_generate_backend_runtime("services/app/api", use_golden = False, use_prisma = False, manifest = manifest)
local('cat > ' + ${JSON.stringify(JSON.stringify(out))}, quiet = True, stdin = stage)
`,
  );
  const result = spawnSync("tilt", ["alpha", "tiltfile-result", "-f", join(project, "Tiltfile")], {
    cwd: project,
    encoding: "utf-8",
    env: { ...process.env, TDK_PROJECT_ROOT: project },
    timeout: 30_000,
  });
  const stage = result.status === 0 ? readFileSync(out, "utf-8") : "";
  return {
    status: result.status,
    stderr: result.stderr,
    healthcheck: stage.split("\n").find((line) => line.startsWith("HEALTHCHECK")) ?? "",
  };
}

describe.skipIf(!hasTilt)("non-golden L4 backend HEALTHCHECK", { timeout: 60_000 }, () => {
  it("probes the service's own port and healthCheckPath", () => {
    const result = renderHealthcheck({ appType: "backend", port: 4001, healthCheckPath: "/ready" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.healthcheck).toContain("http://127.0.0.1:4001/ready");
  });

  it("falls back to port 4000 and /health when the manifest sets neither", () => {
    const result = renderHealthcheck({ appType: "backend" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.healthcheck).toContain("http://127.0.0.1:4000/health");
  });

  it("has no probe for a worker, which serves no HTTP", () => {
    const result = renderHealthcheck({ appType: "worker", port: 6000 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.healthcheck).toBe("HEALTHCHECK NONE");
  });
});
