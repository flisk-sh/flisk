// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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

const script = fileURLToPath(new URL("install-git-hooks.sh", import.meta.url));

// Copies the script into <tmp>/checkout/scripts/, because it finds the
// checkout from its own location. With `gitRepo` the checkout is a git repo;
// without it, it looks like the temporary directory npm unpacks for `prepare`.
// A throwaway global git config and GIT_CEILING_DIRECTORIES keep the test away
// from the real user config and from any repo that contains the temp dir.
function withCheckout({ gitRepo }, fn) {
  const tmp = mkdtempSync(join(tmpdir(), "flisk-install-git-hooks-test-"));
  try {
    const root = join(tmp, "checkout");
    mkdirSync(join(root, "scripts"), { recursive: true });
    copyFileSync(script, join(root, "scripts", "install-git-hooks.sh"));
    const globalConfig = join(tmp, "global-gitconfig");
    writeFileSync(globalConfig, "");
    const env = {
      ...process.env,
      GIT_CONFIG_GLOBAL: globalConfig,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CEILING_DIRECTORIES: tmp,
    };
    if (gitRepo) {
      execFileSync("git", ["init", "-q"], { cwd: root, env, stdio: "pipe" });
    }
    const run = () =>
      spawnSync("bash", [join(root, "scripts", "install-git-hooks.sh")], {
        cwd: root,
        env,
        encoding: "utf8",
      });
    return fn({ root, globalConfig, run });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test("sets core.hooksPath to .githooks in a git checkout and exits 0", () => {
  withCheckout({ gitRepo: true }, ({ root, run }) => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const hooksPath = execFileSync("git", ["-C", root, "config", "--local", "core.hooksPath"], {
      encoding: "utf8",
    }).trim();
    assert.equal(hooksPath, ".githooks");
  });
});

test("exits 0 and changes no git config outside a git checkout", () => {
  withCheckout({ gitRepo: false }, ({ root, globalConfig, run }) => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(root, ".git")), false);
    assert.equal(readFileSync(globalConfig, "utf8"), "");
  });
});
