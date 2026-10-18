// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
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
