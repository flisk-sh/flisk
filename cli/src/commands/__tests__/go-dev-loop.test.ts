// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateStarlark, tiltAvailable } from "../../test-support/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const languageDockerfile = join(
  repoRoot,
  "engine/topologies/platform/docker/dockerfile/language_dockerfile.star",
);
const hasTilt = tiltAvailable();

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// Dockerfile text exactly as the engine generates it, written out with local() because tilt's result JSON does not carry print output.
function generatedGoDockerfile(dev: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), "tdk-go-dockerfile-"));
  dirs.push(dir);
  const out = join(dir, "Dockerfile");
  const result = evaluateStarlark(languageDockerfile, {
    args: `load(${JSON.stringify(languageDockerfile)}, 'generate_language_dockerfile')
local('cat > "' + ${JSON.stringify(out)} + '"', quiet = True, stdin = generate_language_dockerfile('services/shop/orders', 'go', 4100, ${dev ? "True" : "False"}))
`,
  });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(out, "utf-8");
}

// Opt-in Go development loop (#369): a `development` Docker target that rebuilds and restarts on source edits.
describe.skipIf(!hasTilt)("Go development Dockerfile", { timeout: 30_000 }, () => {
  it("adds a development target with the watcher and build caches, and leaves the default Dockerfile free of it", () => {
    const result = evaluateStarlark(languageDockerfile, {
      args: `load(${JSON.stringify(languageDockerfile)}, 'generate_language_dockerfile')
default = generate_language_dockerfile('services/shop/orders', 'go', 4100)
dev = generate_language_dockerfile('services/shop/orders', 'go', 4100, True)
if 'AS development' in default: fail('the default Go Dockerfile must not gain a development target')
if 'air-verse' in default: fail('the default Go Dockerfile must not mention Air')
if 'AS development' not in dev: fail('missing development target')
if 'tdk-go-watch' in default: fail('the default Go Dockerfile must not mention the watcher')
if 'COPY --chmod=755 <<' not in dev or '/usr/local/bin/tdk-go-watch' not in dev: fail('the watcher script is not installed')
if 'CMD ["tdk-go-watch"]' not in dev: fail('the development target must run the watcher')
if 'air-verse' in dev or 'cosmtrek' in dev: fail('Air stops the app before it compiles, so the watcher replaced it')
if '--mount=type=cache,target=/go/pkg/mod' in dev: fail('modules must be downloaded into an image layer, not a cache mount that the priming build cannot see')
if "RUN go build -ldflags='-s -w' -o /tmp/app ." not in dev: fail('the image must prime the Go build cache (a RUN, not a cache mount, so the warm cache is kept in the image the watcher runs from)')
if 'go mod download' not in dev: fail('dependencies must be installed in their own layer so edits do not redownload them')
if 'AS production' not in dev: fail('the production target must remain available')
if 'EXPOSE 4100' not in dev: fail('port contract changed')
`,
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it("builds into a staging binary and stops the running app only after the build succeeded", () => {
    const dev = generatedGoDockerfile(true);
    const build = dev.indexOf(`go build -ldflags='-s -w' -o "$next" .`);
    const stop = dev.indexOf("if stop_app && mv ", build);
    const swap = dev.indexOf('mv "$next" "$app"', stop);
    expect(build).toBeGreaterThan(-1);
    // Stopping first is what Air does and what left the service down for the whole compile (#369 measurement).
    expect(stop).toBeGreaterThan(build);
    expect(swap).toBeGreaterThan(stop);
    expect(dev).toContain("build failed; the last good build keeps running");
    expect(dev).toContain("trap 'stop_app; exit 0' TERM INT");
  });

  it("ships a watcher script the shell accepts", () => {
    const dev = generatedGoDockerfile(true);
    const start = dev.indexOf("<<'TDK_GO_DEV_WATCH'");
    expect(start).toBeGreaterThan(-1);
    const bodyStart = dev.indexOf("\n", start) + 1;
    const bodyEnd = dev.indexOf("\nTDK_GO_DEV_WATCH\n", bodyStart);
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    const dir = mkdtempSync(join(tmpdir(), "tdk-go-watch-"));
    dirs.push(dir);
    const script = join(dir, "tdk-go-watch");
    writeFileSync(script, `${dev.slice(bodyStart, bodyEnd)}\n`);
    // `find -printf` needs GNU find, so the script itself only runs in the image; here it is parsed, not executed.
    const parsed = spawnSync("sh", ["-n", script], { encoding: "utf-8" });
    expect(parsed.status, parsed.stderr).toBe(0);
    // `\n` must reach the shell as backslash-n inside find's -printf format, not as a real newline.
    expect(readFileSync(script, "utf-8")).toContain("-printf '%p %T@ %s\\n'");
  });

  it("lets Go fetch the toolchain go.mod asks for, in the development and the default build stage", () => {
    // golang:1.23 sets GOTOOLCHAIN=local, so Gin 1.12 (go 1.25) stopped with "go.mod requires go >= 1.25" (checked in the image).
    const dev = generatedGoDockerfile(true);
    const plain = generatedGoDockerfile(false);
    const count = (text: string) => (text.match(/ENV GOTOOLCHAIN=auto/g) ?? []).length;
    expect(count(plain)).toBe(1);
    expect(count(dev)).toBe(2);
  });

  it("does not offer a development target for other languages", () => {
    const result = evaluateStarlark(languageDockerfile, {
      args: `load(${JSON.stringify(languageDockerfile)}, 'generate_language_dockerfile')
for lang in ['python', 'rust']:
    plain = generate_language_dockerfile('services/shop/orders', lang, 4100)
    flagged = generate_language_dockerfile('services/shop/orders', lang, 4100, True)
    if plain != flagged: fail(lang + ' output must not change when dev is requested')
`,
    });
    expect(result.status, result.stderr).toBe(0);
  });
});

const read = (...parts: string[]) => readFileSync(join(repoRoot, ...parts), "utf-8");
const registration = read(
  "engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star",
);
const tsBuilder = read("engine/topologies/tilt/resources/orchestrator/builders/typescript.star");
const manifestResource = read(
  "engine/topologies/tilt/resources/orchestrator/generators/manifest_resource.star",
);

describe.skipIf(!hasTilt)("Go live reload switch", { timeout: 30_000 }, () => {
  it("is on only for a Go service with dev.liveReload true", () => {
    const result = evaluateStarlark(languageDockerfile, {
      args: `load(${JSON.stringify(languageDockerfile)}, 'go_live_reload_enabled')
if not go_live_reload_enabled({'language': 'go', 'dev': {'liveReload': True}}): fail('go + liveReload must enable it')
if go_live_reload_enabled({'language': 'go'}): fail('default must stay off')
if go_live_reload_enabled({'language': 'go', 'dev': {'liveReload': False}}): fail('false must stay off')
if go_live_reload_enabled({'language': 'python', 'dev': {'liveReload': True}}): fail('only Go is supported')
if go_live_reload_enabled({'dev': {'liveReload': True}}): fail('a missing language is Bun')
if go_live_reload_enabled({'language': 'go', 'dev': 'yes'}): fail('a malformed dev block must not enable it')
if go_live_reload_enabled(None): fail('no manifest must not enable it')
`,
    });
    expect(result.status, result.stderr).toBe(0);
  });
});

// The engine wiring is checked as source text, like live-update-sync-paths.test.ts: these paths need Tilt's
// docker_build and live_update objects, which a unit evaluation cannot create.
describe("Go development wiring", () => {
  it("generates the development Dockerfile target only when the switch is on", () => {
    expect(manifestResource).toContain("dev=Docker.go_live_reload(manifest)");
  });

  it("builds the development target in Tilt instead of production when the switch is on", () => {
    expect(tsBuilder).toContain(
      "def _build_typescript_service(name, context, dockerfile, live_update_rules, deps, env=None, target='production')",
    );
    expect(tsBuilder).toContain("target=target,");
    expect(registration).toContain(
      "return 'development' if Docker.go_live_reload(config.get('manifest', {})) else 'production'",
    );
    // docker_build gets its target from the shared helper.
    expect(registration).toContain("target = _image_target(config),");
  });

  it("prebuilds the same target for a deferStart service as docker_build does", () => {
    // A deferStart Go service with liveReload would otherwise be prebuilt as `production` under the tag its container runs.
    const start = registration.indexOf("def _register_deferred_image_prebuild(");
    expect(start).toBeGreaterThan(-1);
    const next = registration.indexOf("\ndef ", start + 1);
    const prebuild = registration.slice(start, next === -1 ? undefined : next);
    // The variable interpolated into `docker build` is assigned once, from the shared helper, before the command is built.
    const assignments = prebuild.match(/^\s*target = .*$/gm) ?? [];
    expect(assignments).toEqual(["    target = _image_target(config)"]);
    const assigned = prebuild.indexOf("target = _image_target(config)");
    const used = prebuild.indexOf('docker build --network host --target " + target');
    expect(assigned).toBeGreaterThan(-1);
    expect(used).toBeGreaterThan(assigned);
    expect(prebuild).not.toMatch(/--target\s+production/);
  });

  it("syncs the Go sources and falls back to a rebuild for go.mod, go.sum and the Dockerfile", () => {
    expect(registration).toContain("fall_back_on(");
    expect(registration).toContain("'go.mod'");
    expect(registration).toContain("'go.sum'");
    // Without the switch Go still has no live-update rules.
    expect(registration).toContain(
      "if language == 'rust' or (language == 'go' and not go_live_reload):",
    );
    expect(
      registration.indexOf("if language == 'rust' or (language == 'go' and not go_live_reload):"),
    ).toBeLessThan(registration.indexOf("live_update_rules.append(sync(full_sync_path, dest))"));
  });
});
