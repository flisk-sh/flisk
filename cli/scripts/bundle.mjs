// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Publish-time bundle of the tsc output (dist/ -> dist-bundle/).
//
// ink, react and chalk (plus their transitive deps, notably es-toolkit at
// ~18 MB) are inlined so the npm package does not install them. commander stays external. dist/ itself is committed and untouched; bin/flisk.js
// prefers dist-bundle/ when it exists (only inside a packed/installed package).
// The npm package ships dist-bundle/ and not dist/ (only the two files of its "main"
// entry), so bundled code must not read or import a file under dist/ at runtime.

import { readFileSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const cliDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(cliDir, "dist-bundle");

// Our own modules locate assets relative to import.meta.url/dirname, assuming
// their original place in dist/ (e.g. dist/generator/ -> cli/templates).
// Flattened into one file that depth is lost, so pin each module's
// import.meta.* to where it lived in dist/, relative to the bundle's location.
// These are only starting points for path arithmetic (cli/templates, the
// package root); the dist/ directory itself need not exist.
const keepModuleLocation = {
  name: "keep-module-location",
  setup(b) {
    b.onLoad({ filter: /[\\/]cli[\\/]dist[\\/].*\.js$/ }, (args) => {
      let code = readFileSync(args.path, "utf8");
      if (!code.includes("import.meta.")) return null;
      const rel = relative(join(cliDir, "dist"), args.path).split("\\").join("/");
      const file = `new URL(${JSON.stringify(`../dist/${rel}`)}, import.meta.url)`;
      const dir = `new URL(${JSON.stringify(`../dist/${dirname(rel)}`)}, import.meta.url)`;
      code = code
        .replaceAll("import.meta.url", `${file}.href`)
        .replaceAll("import.meta.dirname", `require("node:url").fileURLToPath(${dir})`);
      return { contents: code, loader: "js", resolveDir: dirname(args.path) };
    });
  },
};

rmSync(out, { recursive: true, force: true });
await build({
  plugins: [keepModuleLocation],
  entryPoints: [join(cliDir, "dist", "cli.js")],
  outdir: out,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  minify: false,
  external: ["commander", "react-devtools-core"],
  banner: {
    js: "import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);",
  },
  logLevel: "warning",
});
