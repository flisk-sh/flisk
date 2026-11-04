#!/usr/bin/env node
// Checks the contents of the @flisk-sh/flisk npm package.
//
// Usage: node scripts/check-npm-package.mjs [--published] --tarball <file.tgz>
//
// --published audits a version that is already on npm (ci.yml's npm-registry-audit). It also accepts
// LEGACY_PUBLISHED_PATHS, the layout of versions published before the current one; every other check stays.
//
// Fails when the package:
// - ships test files (1.4.0 shipped ten),
// - ships a path outside ALLOWED_PATHS, or misses one of REQUIRED_PATHS,
// - ships the CLI twice: cli/dist/ beyond the "main" entry is outside ALLOWED_PATHS (1.4.7 shipped it next to
//   cli/dist-bundle/, about 1.2 MB of JavaScript that nothing in an installed package runs),
// - does not declare "type": "module" (registry sites then report the ESM CLI as CommonJS),
// - has a "bin" entry that is not in the tarball, or no "engines.node",
// - has no "main" entry, or a "main"/"module"/"types" entry that is not in the tarball
//   (registry sites such as bundlephobia need one to size the package),
// - has a "main" entry that imports a file the tarball does not ship.
import { execFileSync } from "node:child_process";
import { posix } from "node:path";

// Any "*.test.*" or "*.spec.*" file counts, whatever the extension (.ts, .py, .star, ...).
const TEST_PATH = /(^|\/)(__tests__|tests)\/|\.(test|spec)\.[^/]+$|(^|\/)test_[^/]*\.py$|_test\.py$/;

// The "main" entry and the one file it imports. They are all the package ships from cli/dist/: cli/bin/flisk.js runs
// cli/dist-bundle/cli.js, which prepack always builds and which inlines every module of cli/dist/ it needs.
export const MAIN_ENTRY_FILES = ["cli/dist/types/index.js", "cli/dist/utils/constants.js"];

// Every shipped path starts with one of these. examples/flisk-example backs `flisk project example`;
// runtime/ holds the Tiltfile, engine, discovery, specs and ext that `flisk up` loads.
// cli/dist/ is deliberately not a prefix here: allowing it again would ship a second copy of the CLI
// (only --published accepts it, for versions already on npm).
export const ALLOWED_PATHS = [
  "cli/bin/",
  "cli/dist-bundle/",
  ...MAIN_ENTRY_FILES,
  "cli/templates/",
  "cli/shared-platform-engineering/docker-templates/",
  "cli/package.json",
  "runtime/",
  "examples/flisk-example/",
  "docs/CHANGELOG.md",
  "LICENSE",
  "README.md",
  "package.json",
];

// Accepted only with --published, for versions already on npm. Drop an entry once the pin in
// .github/npm-package-smoke is a version without it.
export const LEGACY_PUBLISHED_PATHS = [
  // Through 1.4.7 the package shipped all of cli/dist/ next to cli/dist-bundle/.
  "cli/dist/",
  // Before the changelog moved into docs/ (#2554) it shipped at the root (#2558 first allowed it here for every pack).
  "CHANGELOG.md",
];

// The installed CLI breaks without these, so the allowlist alone is not enough.
export const REQUIRED_PATHS = [
  "package.json",
  "README.md",
  "LICENSE",
  "cli/package.json",
  "cli/bin/flisk.js",
  "cli/dist/types/index.js",
  "cli/dist-bundle/cli.js",
  "runtime/Tiltfile",
  "runtime/specs/specs/TILT_TECH_STACK.star",
  "examples/flisk-example/Tiltfile",
];

export function findTestFiles(paths) {
  return paths.filter((path) => TEST_PATH.test(path));
}

export function findUnexpectedPaths(paths, { published = false } = {}) {
  const allowedPaths = published ? [...ALLOWED_PATHS, ...LEGACY_PUBLISHED_PATHS] : ALLOWED_PATHS;
  return paths.filter((path) => !allowedPaths.some((allowed) => path === allowed || path.startsWith(allowed)));
}

export function findMissingPaths(paths) {
  const shipped = new Set(paths);
  return REQUIRED_PATHS.filter((path) => !shipped.has(path));
}

// Relative specifiers of static imports, re-exports, side-effect imports and literal dynamic imports.
const RELATIVE_IMPORT = /\b(?:from|import)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g;

// Files that `entry` imports, directly or through other shipped files, which are not in the package.
// readFile(path) returns the text of a shipped file. A missing entry itself is checkManifest's to report.
export function findMissingImports(entry, paths, readFile) {
  const shipped = new Set(paths);
  const missing = [];
  const seen = new Set();
  const queue = shipped.has(entry) ? [entry] : [];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!shipped.has(file)) {
      missing.push(file);
      continue;
    }
    for (const [, specifier] of readFile(file).matchAll(RELATIVE_IMPORT)) {
      queue.push(posix.join(posix.dirname(file), specifier));
    }
  }
  return missing.sort();
}

export function checkManifest(manifest, paths) {
  const problems = [];
  if (manifest.type !== "module") {
    problems.push(`package.json "type" is ${JSON.stringify(manifest.type)}; expected "module" (the CLI is ESM)`);
  }
  if (!manifest.engines?.node) {
    problems.push('package.json has no "engines.node"');
  }
  const shipped = new Set(paths);
  for (const [name, target] of Object.entries(manifest.bin ?? {})) {
    const path = target.replace(/^\.\//, "");
    if (!shipped.has(path)) problems.push(`bin "${name}" points to ${target}, which is not in the package`);
  }
  if (!manifest.main) {
    problems.push('package.json has no "main" entry; registry sites such as bundlephobia cannot size the package');
  }
  for (const field of ["main", "module", "types"]) {
    if (!manifest[field]) continue;
    const path = manifest[field].replace(/^\.\//, "");
    if (!shipped.has(path)) problems.push(`"${field}" points to ${manifest[field]}, which is not in the package`);
  }
  return problems;
}

// readFile(path) returns a shipped file's text; without it the "main" entry's imports are not checked.
// published accepts LEGACY_PUBLISHED_PATHS (see --published); test files stay forbidden either way.
export function checkPackage(paths, manifest, { readFile, published = false } = {}) {
  const problems = [];
  const report = (title, list) => {
    if (list.length > 0) problems.push(`${list.length} ${title}:`, ...list.map((p) => `  ${p}`));
  };
  report("test file(s) ship in the package", findTestFiles(paths));
  report("path(s) outside the allowlist", findUnexpectedPaths(paths, { published }));
  report("required path(s) missing", findMissingPaths(paths));
  problems.push(...checkManifest(manifest, paths));
  if (readFile && manifest.main) {
    const main = manifest.main.replace(/^\.\//, "");
    report(`file(s) imported by "main" (${main}) missing`, findMissingImports(main, paths, readFile));
  }
  return problems;
}

export function readTarball(tarball) {
  const paths = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line && !line.endsWith("/"))
    .map((line) => line.replace(/^package\//, ""));
  const readFile = (path) => execFileSync("tar", ["-xzOf", tarball, `package/${path}`], { encoding: "utf8" });
  const manifest = JSON.parse(readFile("package.json"));
  return { paths, manifest, readFile };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const index = process.argv.indexOf("--tarball");
  const tarball = index === -1 ? undefined : process.argv[index + 1];
  if (!tarball) {
    console.error("usage: check-npm-package.mjs [--published] --tarball <file.tgz>");
    process.exit(2);
  }
  const published = process.argv.includes("--published");
  const { paths, manifest, readFile } = readTarball(tarball);
  const problems = checkPackage(paths, manifest, { readFile, published });
  if (problems.length > 0) {
    console.error(`check-npm-package: ${manifest.name}@${manifest.version} has problems:`);
    for (const line of problems) console.error(line);
    console.error('Fix the root package.json ("files", "type", "engines", "bin") or the lists in this script.');
    process.exit(1);
  }
  console.log(`check-npm-package: ${manifest.name}@${manifest.version} passes (${paths.length} files)`);
}
