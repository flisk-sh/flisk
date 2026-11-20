// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Guards the repository line-ending rules without changing any file in the working tree.
//   node --test scripts/check-gitattributes.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ATTRIBUTES = path.join(ROOT, ".gitattributes");

// git check-attr -z emits path \0 attribute \0 value triples.
function attributesFor(paths) {
  const output = execFileSync(
    "git",
    ["-C", ROOT, "check-attr", "-z", "text", "eol", "--", ...paths],
    { encoding: "utf8" },
  );
  const fields = output.split("\0");
  if (fields.at(-1) === "") fields.pop();

  const result = new Map();
  for (let i = 0; i < fields.length; i += 3) {
    const [file, attribute, value] = fields.slice(i, i + 3);
    if (!result.has(file)) result.set(file, {});
    result.get(file)[attribute] = value;
  }
  return result;
}

const lf = { text: "set", eol: "lf" };
const crlf = { text: "set", eol: "crlf" };
const auto = { text: "auto", eol: "unspecified" };

const LF_FILES = [
  // Docker templates copied byte-for-byte into Linux images (issue #4000).
  "cli/shared-platform-engineering/docker-templates/install-deps.sh",
  "cli/shared-platform-engineering/docker-templates/bun-hoisted-symlink-fix.sh",
  "cli/shared-platform-engineering/docker-templates/infisical-entrypoint.sh",
  "install.sh",
  // No .bash files are tracked today, but the rule must be there for new ones.
  "docs/examples/setup.bash",
  "examples/byo/falcon/app.py",
  "runtime/discovery/config.star",
  "cli/src/generator/__tests__/golden/basic-stack/TILT_TECH_STACK.star",
  "bench/shop/admin/Dockerfile",
  "examples/byo-jobs/atlas/Dockerfile",
  // Starlark and Handlebars templates that generate Starlark/Tilt sources.
  "bench/competitors/tilt/Tiltfile",
  "cli/src/generator/__tests__/golden/basic-stack/Tiltfile",
  "cli/templates/TILT_TECH_STACK.star.hbs",
  "cli/templates/Tiltfile.hbs",
  // The rule files themselves, so Git never rewrites them on a Windows checkout.
  ".gitattributes",
  ".editorconfig",
];

test("shell, Python, Starlark, Dockerfile and template paths resolve to text eol=lf", () => {
  const attrs = attributesFor(LF_FILES);
  for (const file of LF_FILES) {
    assert.deepEqual(attrs.get(file), lf, `git check-attr ${file}`);
  }
});

test("PowerShell scripts resolve to text eol=crlf", () => {
  const files = [
    "runtime/engine/scripts/build-and-publish-lib.ps1",
    "scripts/windows/setup-wsl.ps1",
    "tests/e2e/platforms/windows/demo-native.ps1",
  ];
  const attrs = attributesFor(files);
  for (const file of files) {
    assert.deepEqual(attrs.get(file), crlf, `git check-attr ${file}`);
  }
});

test("other text files keep text=auto and no forced eol", () => {
  const files = ["package.json", "README.md", "AGENTS.md"];
  const attrs = attributesFor(files);
  for (const file of files) {
    assert.deepEqual(attrs.get(file), auto, `git check-attr ${file}`);
  }
});

test(".gitattributes declares the required baseline rules", () => {
  const contents = readFileSync(ATTRIBUTES, "utf8");
  const rules = [
    "* text=auto",
    "*.sh text eol=lf",
    "*.bash text eol=lf",
    "*.py text eol=lf",
    "*.star text eol=lf",
    "Dockerfile* text eol=lf",
    "*.ps1 text eol=crlf",
  ];
  for (const rule of rules) {
    const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(contents, new RegExp(`^${escaped}$`, "m"), `missing rule: ${rule}`);
  }
});
