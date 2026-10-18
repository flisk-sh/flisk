// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkCandidates, COMPARE_FILE_CAP, releaseInputFor } from "./check-release-candidate.mjs";

const RELEASE = "a".repeat(40);
const OLD = "b".repeat(40);
const OLDER = "c".repeat(40);
const file = (filename) => ({ filename });

// A compare fake: each base maps to { status, files }. Unknown bases are "diverged".
const compareWith = (table) => (base) => table[base] ?? { status: "diverged", files: [] };

test("releaseInputFor matches the same paths as the changes filter in release-binaries.yml", () => {
  assert.equal(releaseInputFor("cli/src/main.ts"), "cli/**");
  assert.equal(releaseInputFor("package.json"), "package.json");
  assert.equal(releaseInputFor("package.jsonx"), undefined);
  assert.equal(releaseInputFor("cli/package.json"), "cli/**");
  assert.equal(releaseInputFor(".github/workflows/e2e-resource-types.yml"), undefined);
  assert.equal(releaseInputFor(".github/workflows/release-binaries.yml"), ".github/workflows/release-binaries.yml");
  assert.equal(releaseInputFor("docs/ci.md"), undefined);
  assert.equal(releaseInputFor("engine/x/y.star"), "engine/**");
  assert.equal(releaseInputFor("Tiltfile"), "Tiltfile");
  assert.equal(releaseInputFor("TiltfileX"), undefined);
});

test("the exact release commit passes without any compare call", () => {
  const result = checkCandidates({
    sha: RELEASE,
    candidates: [OLD, RELEASE],
    compare: () => assert.fail("compare must not run for an exact match"),
  });
  assert.deepEqual(result, { ok: true, candidate: RELEASE, reason: "exact" });
});

test("an ancestor candidate passes when the commits after it change no release input", () => {
  const result = checkCandidates({
    sha: RELEASE,
    candidates: [OLD],
    compare: compareWith({ [OLD]: { status: "ahead", files: [file(".github/workflows/e2e-resource-types.yml"), file("docs/ci.md")] } }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.candidate, OLD);
  assert.equal(result.reason, "ancestor");
  assert.equal(result.changed, 2);
});

test("an ancestor candidate fails when a release input changed after it", () => {
  const result = checkCandidates({
    sha: RELEASE,
    candidates: [OLD],
    compare: compareWith({ [OLD]: { status: "ahead", files: [file("docs/ci.md"), file("cli/src/x.ts")] } }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /release inputs changed since \(cli\/\*\*\)/);
});

test("a rename out of a release input path still counts as a change to it", () => {
  const result = checkCandidates({
    sha: RELEASE,
    candidates: [OLD],
    compare: compareWith({
      [OLD]: { status: "ahead", files: [{ filename: "docs/moved.md", previous_filename: "engine/moved.star" }] },
    }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /engine\/\*\*/);
});

test("a candidate that is not an ancestor of the release commit never passes", () => {
  const result = checkCandidates({
    sha: RELEASE,
    candidates: [OLD],
    compare: compareWith({ [OLD]: { status: "diverged", files: [] } }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /not an ancestor .* \(diverged\)/);
});

test("a compare that hits the file cap is not trusted", () => {
  const files = Array.from({ length: COMPARE_FILE_CAP }, (_, i) => file(`docs/${i}.md`));
  const result = checkCandidates({
    sha: RELEASE,
    candidates: [OLD],
    compare: compareWith({ [OLD]: { status: "ahead", files } }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /too many to check/);
});

test("the gate falls through to an older candidate that does cover the commit", () => {
  const result = checkCandidates({
    sha: RELEASE,
    candidates: [OLD, OLDER],
    compare: compareWith({
      [OLD]: { status: "ahead", files: [file("cli/x.ts")] },
      [OLDER]: { status: "ahead", files: [file("docs/ci.md")] },
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.candidate, OLDER);
});

test("no candidates at all fails with no reasons to report", () => {
  const result = checkCandidates({ sha: RELEASE, candidates: [], compare: () => assert.fail("no compare") });
  assert.deepEqual(result, { ok: false, reasons: [] });
});

test("releaseInputFor treats a directory entry as a prefix, not a substring", () => {
  assert.equal(releaseInputFor("cli"), undefined, "the bare directory name is not a file under cli/**");
  assert.equal(releaseInputFor("clix/a.ts"), undefined);
  assert.equal(releaseInputFor("cli/a/b/c.ts"), "cli/**");
  assert.equal(releaseInputFor("shared-platform-engineering/docker-templates/x/Dockerfile"), "shared-platform-engineering/docker-templates/**");
  assert.equal(releaseInputFor("shared-platform-engineering/other.md"), undefined);
});

test("a bun.lock change after a candidate needs a new candidate", () => {
  const result = checkCandidates({
    sha: RELEASE,
    candidates: [OLD],
    compare: compareWith({ [OLD]: { status: "ahead", files: [file("bun.lock")] } }),
  });
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /release inputs changed since \(bun\.lock\)/);
});

// The CLI end to end: a stub gh on PATH answers the two API calls, so the exit codes and printed reasons are what CI sees.
const script = fileURLToPath(new URL("./check-release-candidate.mjs", import.meta.url));
const stubDir = mkdtempSync(path.join(tmpdir(), "gh-stub-"));
const stubGh = path.join(stubDir, "gh");
writeFileSync(
  stubGh,
  `#!/bin/sh
case "$*" in
  *"/actions/workflows/release-candidate.yml/runs"*) cat "$FAKE_DIR/runs.json" ;;
  *"/compare/"*)
    base=$(printf '%s' "$*" | sed -E 's#.*/compare/([0-9a-f]+)\\.\\.\\..*#\\1#')
    cat "$FAKE_DIR/compare-$base.json" ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
`,
);
chmodSync(stubGh, 0o755);
const fakeDir = mkdtempSync(path.join(tmpdir(), "rc-fake-"));
const runCli = (sha, runs, compares = {}) => {
  writeFileSync(path.join(fakeDir, "runs.json"), JSON.stringify({ workflow_runs: runs }));
  for (const [base, body] of Object.entries(compares)) {
    writeFileSync(path.join(fakeDir, `compare-${base}.json`), JSON.stringify(body));
  }
  return spawnSync(process.execPath, [script, "--sha", sha, "--repo", "tdk-landscape/tdk-cli-core"], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${stubDir}${path.delimiter}${process.env.PATH}`, FAKE_DIR: fakeDir, GH_TOKEN: "x" },
  });
};
const success = (sha) => ({ conclusion: "success", head_sha: sha });

test("cli: the exact commit passes with exit 0", () => {
  const out = runCli(RELEASE, [success(RELEASE)]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Release candidate passed for a{40}/);
});

test("cli: an ancestor with only CI changes passes with exit 0", () => {
  const out = runCli(RELEASE, [success(OLD)], {
    [OLD]: { status: "ahead", files: [{ filename: ".github/workflows/e2e-resource-types.yml" }] },
  });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /changes no release input/);
});

test("cli: a release input change fails with exit 1 and names the candidate and input", () => {
  const out = runCli(RELEASE, [success(OLD)], {
    [OLD]: { status: "ahead", files: [{ filename: "cli/src/main.ts" }] },
  });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /No passing Release candidate covers a{40}/);
  assert.match(out.stderr, /bbbbbbbbb: release inputs changed since \(cli\/\*\*\)/);
});

test("cli: a failed candidate run never counts", () => {
  const out = runCli(RELEASE, [{ conclusion: "failure", head_sha: RELEASE }]);
  assert.equal(out.status, 1);
});

test("cli: missing --sha or --repo prints usage and exits 2", () => {
  const out = spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...process.env, SHA: "", GITHUB_REPOSITORY: "" } });
  assert.equal(out.status, 2);
  assert.match(out.stderr, /usage:/);
});
