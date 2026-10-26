import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  REQUIRED_PATHS,
  checkManifest,
  checkPackage,
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
    "cli/dist/utils/command-helpers.js",
    "runtime/engine/assets/docker/wake-gateway/decide.ts",
    "runtime/engine/topologies/tilt/manifest/loader.star",
    "runtime/specs/specs/TILT_TECH_STACK.star",
    "examples/tdk-example/Tiltfile",
  ];
  assert.deepEqual(findTestFiles(paths), []);
  assert.deepEqual(findUnexpectedPaths(paths), []);
});

test("flags paths outside the allowlist", () => {
  const paths = ["examples/one-backend/service.json", "shared-platform-engineering/x.sh", "docs/README.md", "README.md"];
  assert.deepEqual(findUnexpectedPaths(paths), paths.slice(0, 3));
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

test("reads paths and package.json from a tarball", () => {
  const root = mkdtempSync(join(tmpdir(), "check-npm-package-"));
  for (const path of [...REQUIRED_PATHS, "cli/dist/x.test.js"]) {
    const file = join(root, "package", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, path === "package.json" ? JSON.stringify(MANIFEST) : "");
  }
  const tarball = join(root, "pkg.tgz");
  execFileSync("tar", ["-czf", tarball, "-C", root, "package"]);
  const { paths, manifest } = readTarball(tarball);
  assert.equal(manifest.name, "@flisk-sh/flisk");
  assert.deepEqual(findTestFiles(paths), ["cli/dist/x.test.js"]);
  assert.deepEqual(findMissingPaths(paths), []);
});
