// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Pins a module's import.meta.url / import.meta.dirname to where it lived in dist/, for the flattened dist-bundle/ (see
// bundle.mjs). esbuild's `define` replaces only the expressions, never text inside strings: a template that writes
// `import.meta.url` into a generated file (the --type mcp server's entry-point check) must reach the user unchanged. A plain
// text replace rewrote it, and every scaffolded MCP server from the npm package thought it was imported and never listened.

import { transformSync } from "esbuild";

/** `code` is a dist/ module's source and `rel` its path under dist/ ("commands/project.js"). Returns the pinned source. */
export function pinModuleLocation(code, rel) {
  if (!code.includes("import.meta.")) return code;
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ".";
  const pinned = transformSync(code, {
    loader: "js",
    format: "esm",
    define: {
      "import.meta.url": "__fliskModuleUrl",
      "import.meta.dirname": "__fliskModuleDirname",
    },
  }).code;
  const usesUrl = pinned.includes("__fliskModuleUrl");
  const usesDirname = pinned.includes("__fliskModuleDirname");
  // Only text inside strings mentioned import.meta: the module is left exactly as it was.
  if (!usesUrl && !usesDirname) return code;
  const file = `new URL(${JSON.stringify(`../dist/${rel}`)}, import.meta.url)`;
  const folder = `new URL(${JSON.stringify(`../dist/${dir}`)}, import.meta.url)`;
  return [
    ...(usesUrl ? [`const __fliskModuleUrl = ${file}.href;`] : []),
    ...(usesDirname
      ? [`const __fliskModuleDirname = require("node:url").fileURLToPath(${folder});`]
      : []),
    pinned,
  ].join("\n");
}
