// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { evaluateStarlark, tiltAvailable } from "../../test-support/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const languageDockerfile = join(
  repoRoot,
  "runtime/engine/topologies/platform/docker/dockerfile/language_dockerfile.star",
);
const hasTilt = tiltAvailable();
// The watcher uses GNU find -printf and setsid, so its shell logic only runs on Linux (the dev container's platform).
const hasGnuFind = (() => {
  try {
    return (
      spawnSync("find", [".", "-maxdepth", "0", "-printf", "%p"], { encoding: "utf-8" }).status ===
      0
    );
  } catch {
    return false;
  }
})();
const hasSetsid = (() => {
  try {
    return spawnSync("setsid", ["true"], { encoding: "utf-8" }).status === 0;
  } catch {
    return false;
  }
})();

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// Dockerfile text exactly as the engine generates it, written out with local() because tilt's result JSON does not carry print output.
function generatedGoDockerfile(dev: boolean, testOnSave = ""): string {
  const dir = mkdtempSync(join(tmpdir(), "flisk-go-dockerfile-"));
  dirs.push(dir);
  const out = join(dir, "Dockerfile");
  const result = evaluateStarlark(languageDockerfile, {
    args: `load(${JSON.stringify(languageDockerfile)}, 'generate_language_dockerfile')
local('cat > "' + ${JSON.stringify(out)} + '"', quiet = True, stdin = generate_language_dockerfile('services/shop/orders', 'go', 4100, ${dev ? "True" : "False"}, ${JSON.stringify(testOnSave)}))
`,
  });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(out, "utf-8");
}

// The watcher script exactly as the engine writes it into the image.
function generatedGoWatchScript(testOnSave = ""): string {
  const dev = generatedGoDockerfile(true, testOnSave);
  const start = dev.indexOf("<<'FLISK_GO_DEV_WATCH'");
  expect(start).toBeGreaterThan(-1);
  const bodyStart = dev.indexOf("\n", start) + 1;
  const bodyEnd = dev.indexOf("\nFLISK_GO_DEV_WATCH\n", bodyStart);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return dev.slice(bodyStart, bodyEnd);
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
if 'flisk-go-watch' in default: fail('the default Go Dockerfile must not mention the watcher')
if 'COPY --chmod=755 <<' not in dev or '/usr/local/bin/flisk-go-watch' not in dev: fail('the watcher script is not installed')
if 'CMD ["flisk-go-watch"]' not in dev: fail('the development target must run the watcher')
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
    const start = dev.indexOf("<<'FLISK_GO_DEV_WATCH'");
    expect(start).toBeGreaterThan(-1);
    const bodyStart = dev.indexOf("\n", start) + 1;
    const bodyEnd = dev.indexOf("\nFLISK_GO_DEV_WATCH\n", bodyStart);
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    const dir = mkdtempSync(join(tmpdir(), "flisk-go-watch-"));
    dirs.push(dir);
    const script = join(dir, "flisk-go-watch");
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
  "runtime/engine/topologies/tilt/resources/orchestrator/apply_compose_resource_registration.star",
);
const tsBuilder = read(
  "runtime/engine/topologies/tilt/resources/orchestrator/builders/typescript.star",
);
const manifestResource = read(
  "runtime/engine/topologies/tilt/resources/orchestrator/generators/manifest_resource.star",
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

describe.skipIf(!hasTilt)("Go test-on-save switch", { timeout: 30_000 }, () => {
  it("is on only for a Go service with dev.testOnSave, and resolves the go test scope", () => {
    const result = evaluateStarlark(languageDockerfile, {
      args: `load(${JSON.stringify(languageDockerfile)}, 'go_test_on_save_enabled', 'go_test_on_save_scope')
if not go_test_on_save_enabled({'language': 'go', 'dev': {'testOnSave': True}}): fail('go + testOnSave: True must enable it')
if not go_test_on_save_enabled({'language': 'go', 'dev': {'testOnSave': {'enabled': True}}}): fail('go + dict enabled must enable it')
if not go_test_on_save_enabled({'language': 'go', 'dev': {'liveReload': True, 'testOnSave': True}}): fail('go + liveReload + testOnSave must enable it')
if not go_test_on_save_enabled({'language': 'go', 'dev': {'testOnSave': {'packages': './...'}}}): fail('go + packages pattern defaults to enabled')
if go_test_on_save_enabled({'language': 'go'}): fail('absent testOnSave must stay off')
if go_test_on_save_enabled({'language': 'go', 'dev': {'testOnSave': False}}): fail('false must stay off')
if go_test_on_save_enabled({'language': 'go', 'dev': {'testOnSave': {'enabled': False}}}): fail('enabled false must stay off')
if go_test_on_save_enabled({'language': 'python', 'dev': {'testOnSave': True}}): fail('only Go is supported here')
if go_test_on_save_enabled({'dev': {'testOnSave': True}}): fail('a missing language is Bun')
if go_test_on_save_enabled({'language': 'go', 'dev': 'yes'}): fail('a malformed dev block must not enable it')
if go_test_on_save_enabled(None): fail('no manifest must not enable it')

if go_test_on_save_scope({'language': 'go'}) != '': fail('off scope must be empty')
if go_test_on_save_scope({'language': 'python', 'dev': {'testOnSave': True}}) != '': fail('non-Go scope must be empty')
if go_test_on_save_scope({'language': 'go', 'dev': {'testOnSave': {'enabled': False}}}) != '': fail('disabled scope must be empty')
if go_test_on_save_scope({'language': 'go', 'dev': {'testOnSave': True}}) != 'changed': fail('default scope must be the changed packages')
if go_test_on_save_scope({'language': 'go', 'dev': {'testOnSave': {'enabled': True}}}) != 'changed': fail('dict without packages must be the changed packages')
if go_test_on_save_scope({'language': 'go', 'dev': {'testOnSave': {'packages': './...'}}}) != './...': fail('the packages pattern must be the scope')
if go_test_on_save_scope({'language': 'go', 'dev': {'testOnSave': {'packages': '  ./internal/...  '}}}) != './internal/...': fail('the packages pattern must be trimmed')
`,
    });
    expect(result.status, result.stderr).toBe(0);
  });
});

describe.skipIf(!hasTilt)("Go test-on-save Dockerfile", { timeout: 30_000 }, () => {
  it("arms the watcher through FLISK_GO_TEST_ON_SAVE only when a scope is generated", () => {
    const result = evaluateStarlark(languageDockerfile, {
      args: `load(${JSON.stringify(languageDockerfile)}, 'generate_language_dockerfile')
plain = generate_language_dockerfile('services/shop/orders', 'go', 4100, True)
armed = generate_language_dockerfile('services/shop/orders', 'go', 4100, True, 'changed')
full = generate_language_dockerfile('services/shop/orders', 'go', 4100, True, './...')
nodev = generate_language_dockerfile('services/shop/orders', 'go', 4100, False, 'changed')
if 'ENV FLISK_GO_TEST_ON_SAVE' in plain: fail('no test-on-save env without a scope')
if 'ENV FLISK_GO_TEST_ON_SAVE=changed' not in armed: fail('changed scope env missing')
if 'ENV FLISK_GO_TEST_ON_SAVE=./...' not in full: fail('pattern scope env missing')
if 'ENV FLISK_GO_TEST_ON_SAVE' in nodev: fail('no development stage means no test-on-save env')
if 'flisk-go-watch' not in nodev: fail('the watcher itself must stay out of the default target')
`,
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it("keeps the watcher script parseable and carries the test-on-save helpers", () => {
    const script = generatedGoWatchScript("changed");
    const dir = mkdtempSync(join(tmpdir(), "flisk-go-watch-test-"));
    dirs.push(dir);
    const file = join(dir, "flisk-go-watch");
    writeFileSync(file, `${script}\n`);
    const parsed = spawnSync("sh", ["-n", file], { encoding: "utf-8" });
    expect(parsed.status, parsed.stderr).toBe(0);
    for (const needle of [
      "test_signature()",
      "test_snapshot()",
      "test_changed_paths()",
      "go_package_dirs()",
      "test_args()",
      "run_tests()",
      "go test",
      "FLISK_GO_TEST_ON_SAVE",
    ]) {
      expect(script).toContain(needle);
    }
  });
});

// The package-mapping and argv plumbing only runs on Linux (GNU find -printf, setsid) with Tilt for generation;
// the watcher itself is a container script, so this exercises the generated functions against a real fixture tree.
describe.skipIf(!(hasTilt && hasGnuFind && hasSetsid))(
  "Go watcher test-on-save shell logic",
  { timeout: 30_000 },
  () => {
    it("maps changed files to their packages, go.mod/go.sum to ./..., and feeds go test the right args", () => {
      const dir = mkdtempSync(join(tmpdir(), "flisk-go-test-logic-"));
      dirs.push(dir);
      const work = join(dir, "work");
      const bin = join(dir, "bin");
      mkdirSync(join(work, "internal/foo"), { recursive: true });
      mkdirSync(join(work, "internal/bar"), { recursive: true });
      mkdirSync(join(work, "docs"), { recursive: true });
      mkdirSync(bin, { recursive: true });
      for (const f of [
        "go.mod",
        "main.go",
        "internal/foo/foo.go",
        "internal/foo/foo_test.go",
        "internal/bar/bar.go",
        "docs/guide.md",
      ]) {
        writeFileSync(join(work, f), `// ${f}\n`);
      }
      // A fake `go` records the arguments it was called with.
      const goArgs = join(dir, "go-args.txt");
      writeFileSync(
        join(bin, "go"),
        `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(goArgs)}\nexit 0\n`,
        { mode: 0o755 },
      );

      const script = generatedGoWatchScript("changed");
      const prefixEnd = script.indexOf("\nlast=$(signature)");
      expect(prefixEnd).toBeGreaterThan(0);
      const prefix = join(dir, "watch-functions.sh");
      writeFileSync(prefix, `${script.slice(0, prefixEnd)}\n`);

      const harness = join(dir, "harness.sh");
      writeFileSync(
        harness,
        `#!/bin/sh
set -e
export FLISK_GO_TEST_ON_SAVE=changed
. ${JSON.stringify(prefix)}
test_on_save=changed
cd ${JSON.stringify(work)}
test_snap=$PWD/.snap
test_new=$PWD/.snap.new
test_paths=$PWD/.paths
test_pkgs=$PWD/.pkgs
export PATH=${JSON.stringify(bin)}:$PATH
export GO_ARGS_FILE=${JSON.stringify(goArgs)}

wait_for() {
  i=0
  while [ ! -f "$1" ] && [ "$i" -lt 100 ]; do
    sleep 0.1
    i=$((i + 1))
  done
  [ -f "$1" ]
}

# Baseline snapshot, then an edit in internal/foo: only that package is tested.
test_snapshot > "$test_snap"
echo "// edit" >> internal/foo/foo.go
test_changed_paths
echo "PATHS1:$(paste -sd, "$test_paths")"
echo "ARGS1:$(test_args "$test_paths" | paste -sd, -)"
run_tests changed
wait_for "$GO_ARGS_FILE"
echo "GO1:$(cat "$GO_ARGS_FILE" | paste -sd, -)"
rm -f "$GO_ARGS_FILE"

# A test-file-only edit maps to the same package (build signature would not see it).
echo "// test edit" >> internal/foo/foo_test.go
test_changed_paths
echo "ARGS2:$(test_args "$test_paths" | paste -sd, -)"

# go.mod changed: every package runs.
echo "// dep" >> go.mod
test_changed_paths
echo "ARGS3:$(test_args "$test_paths" | paste -sd, -)"
run_tests changed
wait_for "$GO_ARGS_FILE"
echo "GO3:$(cat "$GO_ARGS_FILE" | paste -sd, -)"
rm -f "$GO_ARGS_FILE"

# A deleted file still maps to its package.
rm internal/bar/bar.go
test_changed_paths
echo "ARGS4:$(test_args "$test_paths" | paste -sd, -)"

# A fixed pattern bypasses the diff entirely.
run_tests ./internal/...
wait_for "$GO_ARGS_FILE"
echo "GO5:$(cat "$GO_ARGS_FILE" | paste -sd, -)"
`,
        { mode: 0o755 },
      );

      const run = spawnSync("sh", [harness], { encoding: "utf-8", timeout: 25_000 });
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout).toContain("PATHS1:./internal/foo/foo.go");
      expect(run.stdout).toContain("ARGS1:./internal/foo");
      expect(run.stdout).toContain("GO1:test,./internal/foo");
      expect(run.stdout).toContain("ARGS2:./internal/foo");
      expect(run.stdout).toContain("ARGS3:./...");
      expect(run.stdout).toContain("GO3:test,./...");
      // bar.go's package lost its only Go file, so the change walks up to the root package.
      expect(run.stdout).toContain("ARGS4:.");
      expect(run.stdout).toContain("GO5:test,./internal/...");
    });
  },
);

// The engine wiring is checked as source text, like live-update-sync-paths.test.ts: these paths need Tilt's
// docker_build and live_update objects, which a unit evaluation cannot create.
describe("Go development wiring", () => {
  it("generates the development Dockerfile target only when the switch is on", () => {
    expect(manifestResource).toContain("dev=Docker.go_live_reload(manifest)");
  });

  it("builds the development target in Tilt instead of production when the switch is on", () => {
    expect(tsBuilder).toContain(
      "def _build_typescript_service(name, context, dockerfile, live_update_rules, deps, env=None, target='production', prebuilt=None)",
    );
    expect(tsBuilder).toContain("target=target,");
    expect(registration).toContain(
      "return 'development' if Docker.go_live_reload(manifest) else 'production'",
    );
    expect(registration).toContain(
      "if _uses_generated_dockerfile(config) and Docker.bun_live_reload(manifest, config['res_path']):",
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
    // The target comes from the shared helper through _prebuild_args, as the fourth positional argument after "sh".
    const argsStart = registration.indexOf("def _prebuild_args(");
    expect(argsStart).toBeGreaterThan(-1);
    const argsEnd = registration.indexOf("\ndef ", argsStart + 1);
    const argsBody = registration.slice(argsStart, argsEnd === -1 ? undefined : argsEnd);
    expect(argsBody).toContain("_image_target(config),");
    expect(prebuild).toContain("args = _prebuild_args(config)");
    expect(prebuild).toContain('--target "$4"');
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
