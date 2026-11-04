// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//   node --test cli/scripts/pin-module-location.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { pinModuleLocation } from "./pin-module-location.mjs";

test("pins import.meta.url and import.meta.dirname in code to the module's place in dist/", () => {
  const out = pinModuleLocation(
    "const here = import.meta.url;\nconst dir = import.meta.dirname;\nexport { here, dir };\n",
    "generator/template-engine.js",
  );
  assert.match(
    out,
    /new URL\("\.\.\/dist\/generator\/template-engine\.js", import\.meta\.url\)\.href/,
  );
  assert.match(out, /new URL\("\.\.\/dist\/generator", import\.meta\.url\)/);
  assert.match(out, /const here = __fliskModuleUrl;/);
  assert.match(out, /const dir = __fliskModuleDirname;/);
});

test("leaves import.meta.url inside a template string unchanged, for the files a template generates", () => {
  const source =
    "export function template(name) {\n" +
    "  return `${name}: realpathSync(fileURLToPath(import.meta.url))`;\n" +
    "}\n";
  const out = pinModuleLocation(source, "backend-frameworks/mcp.js");
  assert.match(out, /realpathSync\(fileURLToPath\(import\.meta\.url\)\)`/);
  assert.doesNotMatch(out, /\.\.\/dist\/backend-frameworks\/mcp\.js/);
});

test("returns a module without import.meta as it is", () => {
  const source = "export const answer = 42;\n";
  assert.equal(pinModuleLocation(source, "a.js"), source);
});
