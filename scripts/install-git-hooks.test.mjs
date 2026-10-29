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
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("install-git-hooks.sh", import.meta.url));
const TIMEOUT_MS = 30_000;

// Copies the script into <tmp>/checkout/scripts/, because it finds the
// checkout from its own location. With `gitRepo` the checkout is a git repo;
// without it, it looks like the temporary directory npm unpacks for `prepare`.
// The temp dir is resolved first (macOS tmpdir is a /var symlink to /private/var,
// and GIT_CEILING_DIRECTORIES does not resolve symlinks). A throwaway global git
// config, GIT_CEILING_DIRECTORIES and an env without inherited GIT_* variables
// (a git hook exports GIT_DIR) keep the test away from the real user config and
// from any repo that contains the temp dir.
function withCheckout({ gitRepo }, fn) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "flisk-install-git-hooks-test-")));
  try {
    const root = join(tmp, "checkout");
    mkdirSync(join(root, "scripts"), { recursive: true });
    copyFileSync(script, join(root, "scripts", "install-git-hooks.sh"));
    const globalConfig = join(tmp, "global-gitconfig");
    writeFileSync(globalConfig, "");
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
    env.GIT_CONFIG_GLOBAL = globalConfig;
    env.GIT_CONFIG_NOSYSTEM = "1";
    env.GIT_CEILING_DIRECTORIES = tmp;
    if (gitRepo) {
      execFileSync("git", ["init", "-q"], { cwd: root, env, stdio: "pipe", timeout: TIMEOUT_MS });
    }
    const run = () =>
      spawnSync("bash", [join(root, "scripts", "install-git-hooks.sh")], {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: TIMEOUT_MS,
      });
    const git = (...args) => spawnSync("git", ["-C", root, ...args], { env, encoding: "utf8", timeout: TIMEOUT_MS });
    const gitConfig = (...args) => git("config", ...args);
    return fn({ tmp, root, globalConfig, run, git, gitConfig });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test("sets core.hooksPath to .githooks in a git checkout and exits 0", () => {
  withCheckout({ gitRepo: true }, ({ run, gitConfig }) => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const hooksPath = gitConfig("--local", "core.hooksPath");
    assert.equal(hooksPath.status, 0, hooksPath.stderr);
    assert.equal(hooksPath.stdout.trim(), ".githooks");
  });
});

test("exits 0 and changes no git config outside a git checkout", () => {
  withCheckout({ gitRepo: false }, ({ tmp, root, globalConfig, run, git, gitConfig }) => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(root, ".git")), false);
    assert.equal(existsSync(join(tmp, ".git")), false);
    assert.equal(readFileSync(globalConfig, "utf8"), "");
    // No repository may be reachable from the checkout, and the key must be unset (`git config --get` exits 1 for that).
    assert.equal(git("rev-parse", "--git-dir").status, 128, "no repository should be reachable from the checkout");
    assert.equal(gitConfig("--get", "core.hooksPath").status, 1);
  });
});
