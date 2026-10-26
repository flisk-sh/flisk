#!/usr/bin/env node
// Checks the contents of the @flisk-sh/flisk npm package.
//
// Usage: node scripts/check-npm-package.mjs --tarball <file.tgz>
//
// Fails when the package:
// - ships test files (1.4.0 shipped ten),
// - ships a path outside ALLOWED_PATHS, or misses one of REQUIRED_PATHS,
// - does not declare "type": "module" (registry sites then report the ESM CLI as CommonJS),
// - has a "bin" entry that is not in the tarball, or no "engines.node",
// - has no "main" entry, or a "main"/"module"/"types" entry that is not in the tarball
//   (registry sites such as bundlephobia need one to size the package).
import { execFileSync } from "node:child_process";

// Any "*.test.*" or "*.spec.*" file counts, whatever the extension (.ts, .py, .star, ...).
const TEST_PATH = /(^|\/)(__tests__|tests)\/|\.(test|spec)\.[^/]+$|(^|\/)test_[^/]*\.py$|_test\.py$/;

// Every shipped path starts with one of these. examples/tdk-example backs `flisk project example`;
// runtime/ holds the Tiltfile, engine, discovery, specs and ext that `flisk up` loads.
export const ALLOWED_PATHS = [
  "cli/bin/",
  "cli/dist/",
  "cli/dist-bundle/",
  "cli/templates/",
  "cli/shared-platform-engineering/docker-templates/",
  "cli/package.json",
  "runtime/",
  "examples/tdk-example/",
  "CHANGELOG.md",
  "LICENSE",
  "README.md",
  "package.json",
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
  "examples/tdk-example/Tiltfile",
];

export function findTestFiles(paths) {
  return paths.filter((path) => TEST_PATH.test(path));
}

export function findUnexpectedPaths(paths) {
  return paths.filter((path) => !ALLOWED_PATHS.some((allowed) => path === allowed || path.startsWith(allowed)));
}

export function findMissingPaths(paths) {
  const shipped = new Set(paths);
  return REQUIRED_PATHS.filter((path) => !shipped.has(path));
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

export function checkPackage(paths, manifest) {
  const problems = [];
  const report = (title, list) => {
    if (list.length > 0) problems.push(`${list.length} ${title}:`, ...list.map((p) => `  ${p}`));
  };
  report("test file(s) ship in the package", findTestFiles(paths));
  report("path(s) outside the allowlist", findUnexpectedPaths(paths));
  report("required path(s) missing", findMissingPaths(paths));
  problems.push(...checkManifest(manifest, paths));
  return problems;
}

export function readTarball(tarball) {
  const paths = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line && !line.endsWith("/"))
    .map((line) => line.replace(/^package\//, ""));
  const manifest = JSON.parse(execFileSync("tar", ["-xzOf", tarball, "package/package.json"], { encoding: "utf8" }));
  return { paths, manifest };
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const index = process.argv.indexOf("--tarball");
  const tarball = index === -1 ? undefined : process.argv[index + 1];
  if (!tarball) {
    console.error("usage: check-npm-package.mjs --tarball <file.tgz>");
    process.exit(2);
  }
  const { paths, manifest } = readTarball(tarball);
  const problems = checkPackage(paths, manifest);
  if (problems.length > 0) {
    console.error(`check-npm-package: ${manifest.name}@${manifest.version} has problems:`);
    for (const line of problems) console.error(line);
    console.error('Fix the root package.json ("files", "type", "engines", "bin") or the lists in this script.');
    process.exit(1);
  }
  console.log(`check-npm-package: ${manifest.name}@${manifest.version} passes (${paths.length} files)`);
}
