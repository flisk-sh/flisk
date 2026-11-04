// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const DIRS = ["engine", "discovery", "specs", "ext"];

// A temp checkout with the script, its runtime-layout helper, an empty cli/
// and the Tilt extension under runtime/ (or at the root for `layout: "flat"`).
function withCheckout({ layout = "runtime", skip = [] } = {}, fn) {
  const root = mkdtempSync(join(tmpdir(), "flisk-stage-npm-engine-test-"));
  try {
    mkdirSync(join(root, "scripts", "lib"), { recursive: true });
    copyFileSync(
      join(scriptsDir, "stage-npm-engine.sh"),
      join(root, "scripts", "stage-npm-engine.sh"),
    );
    copyFileSync(
      join(scriptsDir, "lib", "runtime-layout.sh"),
      join(root, "scripts", "lib", "runtime-layout.sh"),
    );
    mkdirSync(join(root, "cli"));
    const src = layout === "runtime" ? join(root, "runtime") : root;
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "Tiltfile"), "# tiltfile\n");
    for (const dir of DIRS.filter((d) => !skip.includes(d))) {
      mkdirSync(join(src, dir, "nested"), { recursive: true });
      writeFileSync(join(src, dir, "nested", "file.txt"), `${dir}\n`);
    }
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function stage(root, ...args) {
  return spawnSync("bash", [join(root, "scripts", "stage-npm-engine.sh"), ...args], {
    encoding: "utf8",
  });
}

test("stages the Tiltfile and the four directories from runtime/ into cli/", () => {
  withCheckout({}, (root) => {
    const result = stage(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Staged Tiltfile, engine discovery specs ext into cli\//);
    assert.equal(readFileSync(join(root, "cli", "Tiltfile"), "utf8"), "# tiltfile\n");
    for (const dir of DIRS) {
      assert.equal(readFileSync(join(root, "cli", dir, "nested", "file.txt"), "utf8"), `${dir}\n`);
      // copied as cli/<dir>/..., not nested one level deeper on a second run
      assert.equal(existsSync(join(root, "cli", dir, dir)), false);
    }
  });
});

test("falls back to the flat layout when there is no runtime/ directory", () => {
  withCheckout({ layout: "flat" }, (root) => {
    const result = stage(root);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(root, "cli", "Tiltfile")));
    for (const dir of DIRS) assert.ok(existsSync(join(root, "cli", dir, "nested", "file.txt")));
  });
});

test("replaces a stale staged copy instead of nesting into it", () => {
  withCheckout({}, (root) => {
    assert.equal(stage(root).status, 0);
    writeFileSync(join(root, "cli", "engine", "stale.txt"), "old\n");
    const result = stage(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(root, "cli", "engine", "stale.txt")), false);
    assert.equal(existsSync(join(root, "cli", "engine", "engine")), false);
  });
});

test("fails when a source directory is missing", () => {
  withCheckout({ skip: ["specs"] }, (root) => {
    const result = stage(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /specs/);
    assert.doesNotMatch(result.stdout, /Staged Tiltfile/);
  });
});

test("--clean removes everything it staged", () => {
  withCheckout({}, (root) => {
    assert.equal(stage(root).status, 0);
    const result = stage(root, "--clean");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(root, "cli", "Tiltfile")), false);
    for (const dir of DIRS) assert.equal(existsSync(join(root, "cli", dir)), false);
    assert.ok(existsSync(join(root, "runtime", "engine", "nested", "file.txt")));
  });
});
