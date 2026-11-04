import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  MAIN_ENTRY_FILES,
  REQUIRED_PATHS,
  checkManifest,
  checkPackage,
  findMissingImports,
  findMissingPaths,
  findTestFiles,
  findUnexpectedPaths,
  readTarball,
} from "./check-npm-package.mjs";

const MANIFEST = {
  name: "@flisk-sh/flisk",
  version: "0.0.0",
  type: "module",
  engines: { node: ">=22.12.0" },
  bin: { flisk: "cli/bin/flisk.js" },
  main: "./cli/dist/types/index.js",
};

test("flags test files in every shape the package used to ship", () => {
  const paths = [
    "cli/dist/commands/__tests__/project-e2e-helpers.js",
    "cli/dist/commands/ui-loading-screen.test.js",
    "runtime/engine/assets/docker/wake-gateway/decide.test.ts",
    "runtime/engine/topologies/tilt/manifest/tests/test_manifest.star",
    "runtime/discovery/test_resource_snapshot.py",
    "runtime/ext/ide-components/shared/test_config_service.py",
    "runtime/engine/example.test.py",
    "runtime/specs/example.spec.star",
    "cli/dist/x.spec.d.ts",
  ];
  assert.deepEqual(findTestFiles(paths), paths);
});

test("does not mistake spec.master templates for spec files", () => {
  assert.deepEqual(findTestFiles(["cli/templates/spec.master.hbs", "runtime/engine/spec.master.example"]), []);
});

test("keeps shipped runtime and CLI files", () => {
  const paths = [
    "cli/dist-bundle/cli.js",
    "cli/dist-bundle/chunk-3J6XI3NX.js",
    ...MAIN_ENTRY_FILES,
    "runtime/engine/assets/docker/wake-gateway/decide.ts",
    "runtime/engine/topologies/tilt/manifest/loader.star",
    "runtime/specs/specs/TILT_TECH_STACK.star",
    "examples/flisk-example/Tiltfile",
  ];
  assert.deepEqual(findTestFiles(paths), []);
  assert.deepEqual(findUnexpectedPaths(paths), []);
});

test("flags paths outside the allowlist", () => {
  const paths = ["examples/one-backend/service.json", "shared-platform-engineering/x.sh", "docs/README.md", "README.md"];
  assert.deepEqual(findUnexpectedPaths(paths), paths.slice(0, 3));
});

test("allows the changelog in docs/, and at the root only for a version published before #2554", () => {
  const paths = ["CHANGELOG.md", "docs/CHANGELOG.md", "docs/security.md"];
  assert.deepEqual(findUnexpectedPaths(paths), ["CHANGELOG.md", "docs/security.md"]);
  assert.deepEqual(findUnexpectedPaths(paths, { published: true }), ["docs/security.md"]);
});

test("flags a second copy of the CLI under cli/dist", () => {
  // 1.4.7 shipped all of cli/dist/ next to cli/dist-bundle/; the bin runs only the bundle.
  const paths = ["cli/dist/cli.js", "cli/dist/commands/up.js", "cli/dist/utils/command-helpers.js", "cli/dist/types/other.js"];
  assert.deepEqual(findUnexpectedPaths(paths), paths);
  assert.deepEqual(findUnexpectedPaths(["cli/dist-bundle/cli.js", ...MAIN_ENTRY_FILES]), []);
  const problems = checkPackage([...REQUIRED_PATHS, "cli/dist/utils/constants.js", "cli/dist/cli.js"], MANIFEST);
  assert.deepEqual(problems, ["1 path(s) outside the allowlist:", "  cli/dist/cli.js"]);
});

test("the published audit accepts the legacy layout and nothing else", () => {
  // Versions already on npm ship all of cli/dist/ (through 1.4.7) and the root changelog (before #2554).
  const legacy = ["cli/dist/cli.js", "cli/dist/commands/up.js", "CHANGELOG.md"];
  assert.deepEqual(findUnexpectedPaths(legacy), legacy);
  assert.deepEqual(findUnexpectedPaths(legacy, { published: true }), []);
  const unrelated = ["docs/security.md", "examples/one-backend/service.json", "cli/src/cli.ts"];
  assert.deepEqual(findUnexpectedPaths(unrelated, { published: true }), unrelated);
  assert.deepEqual(findUnexpectedPaths(["docs/CHANGELOG.md"]), []);
});

test("the published audit still fails test files and every other check", () => {
  const paths = [...REQUIRED_PATHS, "cli/dist/cli.js", "CHANGELOG.md", "cli/dist/commands/__tests__/up.test.js"];
  assert.deepEqual(checkPackage(paths, MANIFEST, { published: true }), [
    "1 test file(s) ship in the package:",
    "  cli/dist/commands/__tests__/up.test.js",
  ]);
  const strict = checkPackage(paths, MANIFEST);
  assert.deepEqual(strict.slice(2), ["3 path(s) outside the allowlist:", "  cli/dist/cli.js", "  CHANGELOG.md", "  cli/dist/commands/__tests__/up.test.js"]);
  const withoutBin = paths.filter((p) => p !== "cli/bin/flisk.js");
  assert.match(checkPackage(withoutBin, MANIFEST, { published: true }).join("\n"), /required path\(s\) missing:\n  cli\/bin\/flisk\.js/);
});

test("follows the main entry's relative imports", () => {
  const files = {
    "cli/dist/types/index.js": 'import { A } from "../utils/constants.js";\nimport "node:fs";\nexport const B = A;\n',
    "cli/dist/utils/constants.js": 'export * from "./more.js";\nexport const A = 1;\nawait import("../lazy.js");\n',
    "cli/dist/utils/more.js": 'import "./constants.js";\n',
  };
  const readFile = (path) => files[path];
  assert.deepEqual(findMissingImports("cli/dist/types/index.js", Object.keys(files), readFile), ["cli/dist/lazy.js"]);
  const withoutConstants = Object.keys(files).filter((p) => p !== "cli/dist/utils/constants.js");
  assert.deepEqual(findMissingImports("cli/dist/types/index.js", withoutConstants, readFile), ["cli/dist/utils/constants.js"]);
  // A main entry that does not ship is reported by checkManifest, not here.
  assert.deepEqual(findMissingImports("cli/dist/missing.js", Object.keys(files), readFile), []);
});

test("flags missing required paths", () => {
  assert.deepEqual(findMissingPaths(REQUIRED_PATHS), []);
  const withoutSpecs = REQUIRED_PATHS.filter((p) => p !== "runtime/specs/specs/TILT_TECH_STACK.star");
  assert.deepEqual(findMissingPaths(withoutSpecs), ["runtime/specs/specs/TILT_TECH_STACK.star"]);
});

test("checks type, engines and bin in the manifest", () => {
  assert.deepEqual(checkManifest(MANIFEST, REQUIRED_PATHS), []);
  assert.match(checkManifest({ ...MANIFEST, type: undefined }, REQUIRED_PATHS).join(), /expected "module"/);
  assert.match(checkManifest({ ...MANIFEST, type: "commonjs" }, REQUIRED_PATHS).join(), /expected "module"/);
  assert.match(checkManifest({ ...MANIFEST, engines: undefined }, REQUIRED_PATHS).join(), /engines\.node/);
  assert.match(checkManifest({ ...MANIFEST, bin: { flisk: "./cli/bin/missing.js" } }, REQUIRED_PATHS).join(), /not in the package/);
});

test("requires a main entry that ships in the package", () => {
  assert.match(checkManifest({ ...MANIFEST, main: undefined }, REQUIRED_PATHS).join(), /no "main" entry/);
  assert.match(checkManifest({ ...MANIFEST, main: "./cli/dist/missing.js" }, REQUIRED_PATHS).join(), /"main" points to .*not in the package/);
  assert.match(checkManifest({ ...MANIFEST, module: "./cli/dist/missing.js" }, REQUIRED_PATHS).join(), /"module" points to/);
});

test("reports every problem at once", () => {
  const problems = checkPackage(["cli/dist/a.test.js", "docs/x.md"], { ...MANIFEST, type: undefined });
  const headings = problems.filter((line) => !line.startsWith("  "));
  assert.equal(headings.length, 6); // tests, allowlist, missing paths, type, bin and main targets
});

test("reads paths, package.json and file contents from a tarball", () => {
  const root = mkdtempSync(join(tmpdir(), "check-npm-package-"));
  const contents = {
    "package.json": JSON.stringify(MANIFEST),
    "cli/dist/types/index.js": 'import { TECH_STACK_FILE } from "../utils/constants.js";\n',
  };
  for (const path of [...REQUIRED_PATHS, "cli/dist-bundle/x.test.js"]) {
    const file = join(root, "package", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents[path] ?? "");
  }
  const tarball = join(root, "pkg.tgz");
  execFileSync("tar", ["-czf", tarball, "-C", root, "package"]);
  const { paths, manifest, readFile } = readTarball(tarball);
  assert.equal(manifest.name, "@flisk-sh/flisk");
  assert.deepEqual(findTestFiles(paths), ["cli/dist-bundle/x.test.js"]);
  assert.deepEqual(findMissingPaths(paths), []);
  // The fixture ships main but not the constants module it imports.
  assert.deepEqual(checkPackage(paths, manifest, { readFile }).slice(-2), [
    '1 file(s) imported by "main" (cli/dist/types/index.js) missing:',
    "  cli/dist/utils/constants.js",
  ]);
});
