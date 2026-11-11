// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(new URL("release-binaries.sh", import.meta.url));
const ROOT_DIR = dirname(dirname(SCRIPT_PATH));
const SCRIPT_SOURCE = readFileSync(SCRIPT_PATH, "utf8");

function getBash() {
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return "bash";
}

// Build a PATH for running the real script without bun on it and without ever
// reaching a real `gh`: a stub node reports a fake version, a stub gh records
// its call and fails. Directories that contain a bun executable are dropped
// whatever they are called (/usr/local/bin, /opt/homebrew/bin, ~/.bun/bin).
function isolatedPath(workDir) {
  const pathSep = process.platform === "win32" ? ";" : ":";
  const stubBin = join(workDir, "stub-bin");
  mkdirSync(stubBin, { recursive: true });
  writeFileSync(
    join(stubBin, "node"),
    `#!/usr/bin/env bash
for arg in "$@"; do
  if [[ "$arg" == *"package.json"* ]]; then
    echo "0.2.0"
    exit 0
  fi
done
exit 1
`,
  );
  writeFileSync(
    join(stubBin, "gh"),
    `#!/usr/bin/env bash
echo "gh must not be called: $*" >&2
touch "${join(workDir, "gh-called").replace(/\\/g, "/")}"
exit 99
`,
  );
  chmodSync(join(stubBin, "node"), 0o755);
  chmodSync(join(stubBin, "gh"), 0o755);
  const hasBun = (dir) => ["bun", "bun.exe"].some((name) => existsSync(join(dir, name)));
  return [stubBin, ...(process.env.PATH || "").split(pathSep).filter((dir) => dir && !hasBun(dir))].join(pathSep);
}

function extractFunction(source, fnName) {
  const start = source.indexOf(`${fnName}() {`);
  assert.ok(start >= 0, `function ${fnName} must exist in release-binaries.sh`);
  const end = source.indexOf("\n}", start) + 2;
  return source.slice(start, end);
}

test("release-binaries.sh defines expected targets, output names, and release repository", () => {
  assert.match(
    SCRIPT_SOURCE,
    /readonly RELEASE_REPOSITORY="flisk-sh\/releases"/,
    "must publish to flisk-sh/releases",
  );

  const expectedTargets = [
    { target: "bun-linux-x64", output: "flisk-linux-amd64" },
    { target: "bun-linux-arm64", output: "flisk-linux-arm64" },
    { target: "bun-darwin-x64", output: "flisk-darwin-amd64" },
    { target: "bun-darwin-arm64", output: "flisk-darwin-arm64" },
    { target: "bun-windows-x64", output: "flisk-windows-amd64.exe" },
  ];

  for (const { target, output } of expectedTargets) {
    assert.match(
      SCRIPT_SOURCE,
      new RegExp(`build_target\\s+${target}\\s+${output}`),
      `expected build_target mapping for ${target} -> ${output}`,
    );
  }

  assert.match(SCRIPT_SOURCE, /tar -czf flisk-cli-engine\.tar\.gz flisk-cli/);
  assert.match(SCRIPT_SOURCE, /flisk-cli-\$\{RELEASE_TAG\}-binaries\.zip/);
  assert.match(SCRIPT_SOURCE, /> checksums\.txt/);
});

test("release-binaries.sh fails with clear error when bun is missing", (t) => {
  const bash = getBash();
  const workDir = mkdtempSync(join(tmpdir(), "flisk-release-test-"));

  try {
    const cleanPath = isolatedPath(workDir);

    const proc = spawnSync(bash, [SCRIPT_PATH.replace(/\\/g, "/")], {
      cwd: ROOT_DIR,
      env: { ...process.env, PATH: cleanPath },
      encoding: "utf8",
    });

    if (proc.status === null && proc.error) {
      t.skip(`bash spawn unavailable on host: ${proc.error.message}`);
      return;
    }

    assert.equal(proc.status, 1, "must exit non-zero when bun is absent");
    assert.match(proc.stderr, /bun is required to build release binaries/);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("release-binaries.sh --publish-only bypasses bun requirement check", (t) => {
  const bash = getBash();
  const workDir = mkdtempSync(join(tmpdir(), "flisk-release-test-"));

  try {
    const cleanPath = isolatedPath(workDir);

    const proc = spawnSync(bash, [SCRIPT_PATH.replace(/\\/g, "/"), "--publish-only"], {
      cwd: ROOT_DIR,
      env: { ...process.env, PATH: cleanPath },
      encoding: "utf8",
    });

    if (proc.status === null && proc.error) {
      t.skip(`bash spawn unavailable on host: ${proc.error.message}`);
      return;
    }

    assert.equal(proc.status, 1, "must exit non-zero when assets are missing");
    assert.match(proc.stderr, /Required release asset is missing or empty:/);
    assert.doesNotMatch(
      proc.stderr,
      /bun is required to build release binaries/,
      "bun check must be bypassed with --publish-only",
    );
    assert.equal(existsSync(join(workDir, "gh-called")), false, "validation must fail before any gh call");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("build_target dry-run invokes bun compile with expected target outfiles", (t) => {
  const bash = getBash();
  const workDir = mkdtempSync(join(tmpdir(), "flisk-release-target-"));

  try {
    const binDir = join(workDir, "bin");
    mkdirSync(binDir, { recursive: true });

    const mockBun = join(binDir, "bun");
    const recordFile = join(workDir, "invocations.txt");
    writeFileSync(
      mockBun,
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${recordFile.replace(/\\/g, "/")}"
`,
    );
    chmodSync(mockBun, 0o755);

    const buildTargetFn = extractFunction(SCRIPT_SOURCE, "build_target");
    const harness = join(workDir, "harness.sh");
    writeFileSync(
      harness,
      `#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="/test-root"
RELEASE_DIR="/test-release"
${buildTargetFn}
build_target bun-linux-x64 flisk-linux-amd64
build_target bun-linux-arm64 flisk-linux-arm64
build_target bun-darwin-x64 flisk-darwin-amd64
build_target bun-darwin-arm64 flisk-darwin-arm64
build_target bun-windows-x64 flisk-windows-amd64.exe
`,
    );
    chmodSync(harness, 0o755);

    const pathSep = process.platform === "win32" ? ";" : ":";
    const proc = spawnSync(bash, [harness.replace(/\\/g, "/")], {
      env: {
        ...process.env,
        PATH: [binDir, process.env.PATH || ""].join(pathSep),
      },
      encoding: "utf8",
    });

    if (proc.status === null && proc.error) {
      t.skip(`bash spawn unavailable on host: ${proc.error.message}`);
      return;
    }

    assert.equal(proc.status, 0, `harness must succeed: ${proc.stderr}`);
    const recorded = readFileSync(recordFile, "utf8").trim().split("\n");
    assert.deepEqual(recorded, [
      "build --compile --target=bun-linux-x64 --outfile=/test-release/flisk-linux-amd64 /test-root/cli/src/cli.ts",
      "build --compile --target=bun-linux-arm64 --outfile=/test-release/flisk-linux-arm64 /test-root/cli/src/cli.ts",
      "build --compile --target=bun-darwin-x64 --outfile=/test-release/flisk-darwin-amd64 /test-root/cli/src/cli.ts",
      "build --compile --target=bun-darwin-arm64 --outfile=/test-release/flisk-darwin-arm64 /test-root/cli/src/cli.ts",
      "build --compile --target=bun-windows-x64 --outfile=/test-release/flisk-windows-amd64.exe /test-root/cli/src/cli.ts",
    ]);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("validate_release_assets detects missing required target assets", (t) => {
  const bash = getBash();
  const workDir = mkdtempSync(join(tmpdir(), "flisk-release-assets-"));

  try {
    const validateFn = extractFunction(SCRIPT_SOURCE, "validate_release_assets");
    const harness = join(workDir, "harness.sh");
    writeFileSync(
      harness,
      `#!/usr/bin/env bash
set -euo pipefail
RELEASE_DIR="${workDir.replace(/\\/g, "/")}"
RELEASE_TAG="v0.2.0"
${validateFn}
validate_release_assets
`,
    );
    chmodSync(harness, 0o755);

    const proc = spawnSync(bash, [harness.replace(/\\/g, "/")], { encoding: "utf8" });
    if (proc.status === null && proc.error) {
      t.skip(`bash spawn unavailable on host: ${proc.error.message}`);
      return;
    }

    assert.equal(proc.status, 1, "must fail when required release asset is missing");
    assert.match(proc.stderr, /Required release asset is missing or empty: flisk-linux-amd64/);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("validate_release_assets validates PE MZ signature on Windows binary", (t) => {
  const bash = getBash();
  const workDir = mkdtempSync(join(tmpdir(), "flisk-release-mz-"));

  try {
    const requiredFiles = [
      "flisk-linux-amd64",
      "flisk-linux-arm64",
      "flisk-darwin-amd64",
      "flisk-darwin-arm64",
      "flisk-windows-amd64.exe",
      "flisk-cli-engine.tar.gz",
      "flisk-cli-v0.2.0-binaries.zip",
    ];

    for (const file of requiredFiles) {
      writeFileSync(join(workDir, file), "not-mz-content\n");
    }

    const validateFn = extractFunction(SCRIPT_SOURCE, "validate_release_assets");
    const harness = join(workDir, "harness.sh");
    writeFileSync(
      harness,
      `#!/usr/bin/env bash
set -euo pipefail
RELEASE_DIR="${workDir.replace(/\\/g, "/")}"
RELEASE_TAG="v0.2.0"
${validateFn}
validate_release_assets
`,
    );
    chmodSync(harness, 0o755);

    const proc = spawnSync(bash, [harness.replace(/\\/g, "/")], { encoding: "utf8" });
    if (proc.status === null && proc.error) {
      t.skip(`bash spawn unavailable on host: ${proc.error.message}`);
      return;
    }

    assert.equal(proc.status, 1, "must fail when Windows binary lacks MZ header");
    assert.match(proc.stderr, /Windows binary is not a PE executable \(missing MZ signature\)/);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

export function getBunLockCliWorkspaceVersion(lockfileContent) {
  if (typeof lockfileContent !== "string") {
    throw new TypeError("bun.lock content must be a string");
  }
  const cliStart = lockfileContent.indexOf('"cli":');
  if (cliStart === -1) {
    throw new Error('no "cli" workspace entry found in bun.lock');
  }
  const braceStart = lockfileContent.indexOf("{", cliStart);
  if (braceStart === -1) {
    throw new Error('malformed "cli" workspace entry in bun.lock (missing opening brace)');
  }
  let depth = 1;
  let i = braceStart + 1;
  for (; i < lockfileContent.length && depth > 0; i++) {
    if (lockfileContent[i] === "{") depth++;
    else if (lockfileContent[i] === "}") depth--;
  }
  if (depth !== 0) {
    throw new Error('malformed "cli" workspace entry in bun.lock (unclosed brace)');
  }
  const cliBlock = lockfileContent.slice(cliStart, i);
  const match = cliBlock.match(/"version":\s*"([^"]+)"/);
  if (!match) {
    throw new Error('no "version" field found in "cli" workspace entry in bun.lock');
  }
  return match[1];
}

export function updateBunLockCliWorkspaceVersion(lockfileContent, newVersion) {
  if (typeof lockfileContent !== "string") {
    throw new TypeError("bun.lock content must be a string");
  }
  if (typeof newVersion !== "string" || !newVersion.trim()) {
    throw new TypeError("newVersion must be a non-empty string");
  }
  const cliStart = lockfileContent.indexOf('"cli":');
  if (cliStart === -1) {
    throw new Error('no "cli" workspace entry found in bun.lock');
  }
  const braceStart = lockfileContent.indexOf("{", cliStart);
  if (braceStart === -1) {
    throw new Error('malformed "cli" workspace entry in bun.lock (missing opening brace)');
  }
  let depth = 1;
  let i = braceStart + 1;
  for (; i < lockfileContent.length && depth > 0; i++) {
    if (lockfileContent[i] === "{") depth++;
    else if (lockfileContent[i] === "}") depth--;
  }
  if (depth !== 0) {
    throw new Error('malformed "cli" workspace entry in bun.lock (unclosed brace)');
  }
  const cliBlock = lockfileContent.slice(cliStart, i);
  const versionRegex = /("version":\s*")[^"]+(")/
  if (!versionRegex.test(cliBlock)) {
    throw new Error('no "version" field found in "cli" workspace entry in bun.lock');
  }
  const updatedCliBlock = cliBlock.replace(versionRegex, (_, key, quote) => key + newVersion + quote);
  return lockfileContent.slice(0, cliStart) + updatedCliBlock + lockfileContent.slice(i);
}

export function assertCliVersionsMatch(pkgJsonContent, bunLockContent) {
  let pkg;
  try {
    pkg = typeof pkgJsonContent === "string" ? JSON.parse(pkgJsonContent) : pkgJsonContent;
  } catch (err) {
    throw new Error(`failed to parse cli/package.json: ${err.message}`);
  }
  const packageVersion = pkg?.version;
  if (!packageVersion) {
    throw new Error('no "version" field found in cli/package.json');
  }
  const lockVersion = getBunLockCliWorkspaceVersion(bunLockContent);
  if (packageVersion !== lockVersion) {
    throw new Error(
      `cli/package.json version (${packageVersion}) does not match bun.lock CLI workspace version (${lockVersion})`,
    );
  }
  return { packageVersion, lockVersion };
}

test("cli/package.json version matches bun.lock cli workspace version", () => {
  const cliPkg = readFileSync(join(ROOT_DIR, "cli/package.json"), "utf8");
  const bunLock = readFileSync(join(ROOT_DIR, "bun.lock"), "utf8");
  const { packageVersion, lockVersion } = assertCliVersionsMatch(cliPkg, bunLock);
  assert.equal(
    packageVersion,
    lockVersion,
    `expected cli/package.json (${packageVersion}) to match bun.lock (${lockVersion})`,
  );
});

test("assertCliVersionsMatch succeeds when versions match exactly", () => {
  const pkg = JSON.stringify({ name: "flisk-cli-internal", version: "1.4.13" });
  const lock = `{\n  "workspaces": {\n    "cli": {\n      "name": "flisk-cli-internal",\n      "version": "1.4.13",\n    },\n  },\n}`;
  const res = assertCliVersionsMatch(pkg, lock);
  assert.deepEqual(res, { packageVersion: "1.4.13", lockVersion: "1.4.13" });
});

test("assertCliVersionsMatch fails with actionable error identifying both versions when they disagree", () => {
  const pkg = JSON.stringify({ name: "flisk-cli-internal", version: "1.4.13" });
  const lock = `{\n  "workspaces": {\n    "cli": {\n      "name": "flisk-cli-internal",\n      "version": "1.4.5",\n    },\n  },\n}`;
  assert.throws(
    () => assertCliVersionsMatch(pkg, lock),
    (err) => {
      assert.match(
        err.message,
        /cli\/package\.json version \(1\.4\.13\) does not match bun\.lock CLI workspace version \(1\.4\.5\)/,
      );
      return true;
    },
  );
});

test("assertCliVersionsMatch rejects malformed input and missing entries", () => {
  const validPkg = JSON.stringify({ version: "1.4.13" });
  const validLock = `{\n  "workspaces": {\n    "cli": {\n      "version": "1.4.13",\n    },\n  },\n}`;

  assert.throws(
    () => assertCliVersionsMatch("not-valid-json", validLock),
    /failed to parse cli\/package\.json/,
  );

  assert.throws(
    () => assertCliVersionsMatch(JSON.stringify({ name: "flisk-cli" }), validLock),
    /no "version" field found in cli\/package\.json/,
  );

  assert.throws(
    () => assertCliVersionsMatch(validPkg, `{\n  "workspaces": {}\n}`),
    /no "cli" workspace entry found in bun\.lock/,
  );

  assert.throws(
    () => assertCliVersionsMatch(validPkg, `{\n  "workspaces": {\n    "cli": {\n      "version": "1.4.13",\n`),
    /malformed "cli" workspace entry in bun\.lock/,
  );

  assert.throws(
    () => assertCliVersionsMatch(validPkg, `{\n  "workspaces": {\n    "cli": {\n      "name": "flisk-cli-internal",\n    },\n  },\n}`),
    /no "version" field found in "cli" workspace entry in bun\.lock/,
  );
});

test("updateBunLockCliWorkspaceVersion updates CLI version while preserving formatting and other entries", () => {
  const originalLock = `{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {
    "": {
      "name": "@flisk-sh/flisk",
      "dependencies": {
        "commander": "^15.0.0",
      },
    },
    "cli": {
      "name": "flisk-cli-internal",
      "version": "1.4.5",
      "dependencies": {
        "commander": "^15.0.0",
      },
    },
  },
  "packages": {
    "chalk": ["chalk@6.0.1", "", {}, "sha512-abc123=="],
  },
}
`;
  const updated = updateBunLockCliWorkspaceVersion(originalLock, "1.4.13");
  assert.equal(getBunLockCliWorkspaceVersion(updated), "1.4.13");
  const expected = originalLock.replace('"version": "1.4.5",', '"version": "1.4.13",');
  assert.equal(updated, expected);
});

test("release-binaries.yml workflow synchronizes bun.lock and stages it with package.json", () => {
  const workflowPath = join(ROOT_DIR, ".github/workflows/release-binaries.yml");
  const workflowContent = readFileSync(workflowPath, "utf8");

  assert.match(
    workflowContent,
    /const lockBefore = fs\.readFileSync\("bun\.lock", "utf8"\);/,
    "release workflow must read bun.lock during version bump",
  );
  assert.match(
    workflowContent,
    /fs\.writeFileSync\("bun\.lock", lockAfter\);/,
    "release workflow must write updated bun.lock during version bump",
  );
  assert.match(
    workflowContent,
    /git add package\.json cli\/package\.json bun\.lock/,
    "release workflow must stage bun.lock in commit step",
  );

  const workDir = mkdtempSync(join(tmpdir(), "flisk-version-bump-"));
  try {
    const pkgPath = join(workDir, "package.json");
    const cliDir = join(workDir, "cli");
    mkdirSync(cliDir, { recursive: true });
    const cliPkgPath = join(cliDir, "package.json");
    const lockPath = join(workDir, "bun.lock");

    writeFileSync(pkgPath, JSON.stringify({ name: "@flisk-sh/flisk", version: "1.4.13" }, null, 2));
    writeFileSync(cliPkgPath, JSON.stringify({ name: "flisk-cli-internal", version: "1.4.13" }, null, 2));
    writeFileSync(
      lockPath,
      `{\n  "workspaces": {\n    "cli": {\n      "name": "flisk-cli-internal",\n      "version": "1.4.13",\n    },\n  },\n}`,
    );

    const nextVersion = "1.4.14";
    for (const f of [pkgPath, cliPkgPath]) {
      const before = readFileSync(f, "utf8");
      const after = before.replace(/("version":\s*")[^"]+"/, (_, key) => key + nextVersion + '"');
      writeFileSync(f, after);
    }
    const lockBefore = readFileSync(lockPath, "utf8");
    const lockAfter = updateBunLockCliWorkspaceVersion(lockBefore, nextVersion);
    writeFileSync(lockPath, lockAfter);

    assert.equal(JSON.parse(readFileSync(pkgPath, "utf8")).version, "1.4.14");
    assert.equal(JSON.parse(readFileSync(cliPkgPath, "utf8")).version, "1.4.14");
    assert.equal(getBunLockCliWorkspaceVersion(readFileSync(lockPath, "utf8")), "1.4.14");

    const matchRes = assertCliVersionsMatch(readFileSync(cliPkgPath, "utf8"), readFileSync(lockPath, "utf8"));
    assert.deepEqual(matchRes, { packageVersion: "1.4.14", lockVersion: "1.4.14" });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

// The release's wall time (1.4.37: 14 minutes, 1.4.38 candidate: 10). The MCP Registry publish retries while npm catches up, so
// inside publish it held the version bump and the tag back by about 2.5 minutes; the candidate's legs ran 10 at a time in 3 waves.
function jobBlock(workflow, job) {
  const start = workflow.indexOf(`\n  ${job}:\n`);
  assert.notEqual(start, -1, `job ${job} must exist`);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}(?:# |[a-z][\w-]*:\n)/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

test("the MCP Registry publish is its own workflow, started when the release run completes, not on the release's path", () => {
  const release = readFileSync(join(ROOT_DIR, ".github/workflows/release-binaries.yml"), "utf8");
  const publish = jobBlock(release, "publish");
  assert.doesNotMatch(publish, /mcp-publisher|Publish to the MCP Registry/, "publish must not wait on the MCP Registry");
  assert.match(publish, /name: Commit the version bump/);
  assert.doesNotMatch(release, /mcp-publisher/, "the release run must end without waiting for the MCP Registry (#3938)");
  const mcp = readFileSync(join(ROOT_DIR, ".github/workflows/publish-mcp-registry.yml"), "utf8");
  const releaseName = release.match(/^name: (.+)$/m)[1];
  assert.ok(mcp.includes(`workflows: ["${releaseName}"]`), "it must be triggered by the release workflow's name");
  assert.match(mcp, /types: \[completed\]/);
  assert.match(mcp, /workflow_run\.conclusion == 'success'/, "a failed release has nothing to list");
  assert.match(mcp, /workflow_dispatch:/, "a missing listing is repaired by hand with -f version=<version>");
  assert.match(mcp, /id-token: write/, "mcp-publisher logs in with the run's GitHub OIDC token");
  assert.match(mcp, /release-dist-/, "the version comes from the release run's artifact name");
  assert.match(mcp, /mcp-publisher" publish server\.json/);
  // npm can take more than 3 minutes to serve a new version; publishing before it does fails registry validation (1.4.34-1.4.39).
  assert.match(mcp, /seq 1 90/, "the 15 minute npm wait stays");
  assert.match(mcp, /for attempt in 1 2 3 4 5/, "the 5 retries stay");
  const waitAt = mcp.search(/registry\.npmjs\.org\/@flisk-sh%2fflisk\/\$\{VERSION\}/);
  assert.ok(waitAt !== -1, "the job must wait until npm serves this exact version");
  assert.ok(waitAt < mcp.indexOf('mcp-publisher" publish'), "the npm wait must come before the first publish attempt");
});

test("the CLI image pre-flight and the push build share one Actions layer cache (#3939)", () => {
  const script = readFileSync(join(ROOT_DIR, "scripts/release/push-flisk-image.sh"), "utf8");
  assert.match(script, /--cache-from "type=gha,scope=\$FLISK_IMAGE_CACHE_SCOPE"/);
  assert.match(script, /--cache-to "type=gha,scope=\$FLISK_IMAGE_CACHE_SCOPE,mode=max,ignore-error=true"/, "a cache outage must not fail a pushed build");
  const dockerfile = readFileSync(join(ROOT_DIR, "scripts/release/flisk-image.Dockerfile"), "utf8");
  assert.ok(dockerfile.indexOf("ARG VERSION") > dockerfile.lastIndexOf("tilt version"), "ARG VERSION must come after the apt and Tilt layers");
  const preflight = jobBlock(readFileSync(join(ROOT_DIR, ".github/workflows/release-binaries.yml"), "utf8"), "cli-image");
  const publish = readFileSync(join(ROOT_DIR, ".github/workflows/publish-cli-image.yml"), "utf8");
  for (const [name, text] of [["cli-image", preflight], ["publish-cli-image.yml", publish]]) {
    assert.match(text, /crazy-max\/ghaction-github-runtime@[0-9a-f]{40}/, `${name} must export the Actions cache variables`);
    assert.match(text, /FLISK_IMAGE_CACHE_SCOPE: cli-image/, `${name} must write its own scope`);
    assert.match(text, /FLISK_IMAGE_CACHE_IMPORT: cli-image/, `${name} must also read the other build's scope`);
  }
});

test("the CLI image stores the flisk binary in one layer (#3947)", () => {
  const dockerfile = readFileSync(join(ROOT_DIR, "scripts/release/flisk-image.Dockerfile"), "utf8");
  assert.match(dockerfile, /^COPY --chmod=0755 flisk-linux-\$\{TARGETARCH\} \/opt\/flisk\/flisk$/m);
  assert.doesNotMatch(dockerfile, /^RUN\b.*\b(chmod|chown)\b.*\/opt\/flisk\/flisk\b/m, "a RUN that changes the binary's mode or owner copies it into a new layer");
});

test("the release candidate runs at least 15 legs at once", () => {
  const workflow = readFileSync(join(ROOT_DIR, ".github/workflows/release-candidate.yml"), "utf8");
  const cap = Number(workflow.match(/max-parallel: (\d+)/)?.[1]);
  assert.ok(cap >= 15 && cap < 20, `max-parallel is ${cap}: below 15 the candidate takes 3 waves, 20 starves the shared runner pool`);
});
