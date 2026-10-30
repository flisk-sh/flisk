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

const rootPackagePath = fileURLToPath(new URL("../package.json", import.meta.url));
const prepareCommand = JSON.parse(readFileSync(rootPackagePath, "utf8")).scripts.prepare;
const TIMEOUT_MS = 30_000;

function withCheckout({ gitRepo = true, hooksDirectory = false, globalHooksPath }, fn) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), "flisk-install-git-hooks-test-")));
  try {
    const root = join(tmp, "checkout");
    const scripts = join(root, "scripts");
    mkdirSync(scripts, { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "flisk-hooks-fixture", version: "1.0.0", scripts: { prepare: prepareCommand } }),
    );
    copyFileSync(fileURLToPath(new URL("./install-git-hooks.sh", import.meta.url)), join(scripts, "install-git-hooks.sh"));
    if (hooksDirectory) {
      mkdirSync(join(root, ".githooks"));
      writeFileSync(join(root, ".githooks", "pre-commit"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    }

    const globalConfig = join(tmp, "global-gitconfig");
    writeFileSync(globalConfig, "");
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
    env.GIT_CONFIG_GLOBAL = globalConfig;
    env.GIT_CONFIG_NOSYSTEM = "1";
    env.GIT_CEILING_DIRECTORIES = tmp;
    if (globalHooksPath) {
      execFileSync("git", ["config", "--file", globalConfig, "core.hooksPath", globalHooksPath], { env });
    }
    if (gitRepo) {
      execFileSync("git", ["init", "-q"], { cwd: root, env, stdio: "pipe", timeout: TIMEOUT_MS });
    }

    // npm is a .cmd shim on Windows; the command and arguments are literals, never input.
    const runInstall = () =>
      // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
      spawnSync("npm", ["install", "--package-lock=false", "--no-audit", "--no-fund"], {
        cwd: root,
        env,
        encoding: "utf8",
        shell: process.platform === "win32",
        timeout: TIMEOUT_MS,
      });
    const gitConfig = (...args) =>
      spawnSync("git", ["-C", root, "config", ...args], { env, encoding: "utf8", timeout: TIMEOUT_MS });
    return fn({ root, globalConfig, runInstall, gitConfig });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test("package install does not override hooks when the checkout has no .githooks directory", () => {
  withCheckout({ hooksDirectory: false, globalHooksPath: "user-hooks" }, ({ root, runInstall, gitConfig }) => {
    const result = runInstall();
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    assert.equal(existsSync(join(root, ".githooks")), false);
    const localHooksPath = gitConfig("--local", "--get", "core.hooksPath");
    assert.equal(localHooksPath.status, 1, localHooksPath.stderr);
    const effectiveHooksPath = gitConfig("--get", "core.hooksPath");
    assert.equal(effectiveHooksPath.stdout.trim(), "user-hooks");
  });
});

test("package install uses .githooks when the checkout ships that directory", () => {
  withCheckout({ hooksDirectory: true }, ({ root, runInstall, gitConfig }) => {
    const result = runInstall();
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    assert.equal(existsSync(join(root, ".githooks", "pre-commit")), true);
    const hooksPath = gitConfig("--local", "--get", "core.hooksPath");
    assert.equal(hooksPath.status, 0, hooksPath.stderr);
    assert.equal(hooksPath.stdout.trim(), ".githooks");
  });
});

test("package install exits cleanly and changes no git config outside a checkout", () => {
  withCheckout({ gitRepo: false }, ({ root, globalConfig, runInstall }) => {
    const result = runInstall();
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    assert.equal(existsSync(join(root, ".git")), false);
    assert.equal(readFileSync(globalConfig, "utf8"), "");
  });
});
