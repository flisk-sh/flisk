// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// Decides which commit a release tag points at, so the tag, the GitHub release and the npm package describe the
// same content (#3054).
//
// The publish job builds and publishes commit P. The version bump then lands on main as a squash commit B, but
// main has usually moved since P, so B carries everything merged in between. Tagging B (what the workflow did)
// meant v1.4.30 pointed at code that was never in the npm package: #3024, #3025 and #3028 were in the tag and the
// notes but not in the tarball.
//
//   node scripts/release-tag-target.mjs --published <P> --bump <B>
//
// Prints one JSON line {"target","drift","extra"}:
// - the bump commit B has exactly P's content plus the version files: target is B, drift false;
// - B has other changes: target is a new commit with P as its parent and P's tree, with the version files taken
//   from B. It has the new version in package.json, and holds only what was published. drift is true and extra
//   lists the files of B that are not in the tag.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Files the version bump is allowed to change (see "Commit the version bump" in release-binaries.yml). */
export const BUMP_FILES = ["package.json", "cli/package.json", "bun.lock", "docs/CHANGELOG.md"];

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

/** The tree of `published` with the bump files copied from `bump`. */
function mergedTree(published, bump, cwd) {
  const dir = mkdtempSync(path.join(tmpdir(), "release-tag-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(dir, "index") };
  try {
    execFileSync("git", ["read-tree", published], { cwd, env, stdio: "pipe" });
    for (const file of BUMP_FILES) {
      const listed = git(["ls-tree", bump, "--", file], { cwd });
      if (listed) {
        const [meta, name] = listed.split("\t");
        const [mode, , blob] = meta.split(" ");
        execFileSync("git", ["update-index", "--add", "--cacheinfo", `${mode},${blob},${name}`], { cwd, env, stdio: "pipe" });
      } else {
        execFileSync("git", ["update-index", "--force-remove", "--", file], { cwd, env, stdio: "pipe" });
      }
    }
    return execFileSync("git", ["write-tree"], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * @param {{published: string, bump: string, cwd?: string, message?: string}} input
 * @returns {{target: string, drift: boolean, extra: string[]}}
 */
export function releaseTagTarget({ published, bump, cwd = process.cwd(), message }) {
  const expected = mergedTree(published, bump, cwd);
  const bumpTree = git(["rev-parse", `${bump}^{tree}`], { cwd });
  if (expected === bumpTree) return { target: git(["rev-parse", bump], { cwd }), drift: false, extra: [] };
  const extra = git(["diff-tree", "-r", "--name-only", expected, bumpTree], { cwd }).split("\n").filter(Boolean);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "github-actions[bot]",
    GIT_AUTHOR_EMAIL: "41898283+github-actions[bot]@users.noreply.github.com",
    GIT_COMMITTER_NAME: "github-actions[bot]",
    GIT_COMMITTER_EMAIL: "41898283+github-actions[bot]@users.noreply.github.com",
  };
  const subject = message ?? `Release commit: ${published.slice(0, 9)} plus the version files of ${bump.slice(0, 9)}`;
  const target = execFileSync("git", ["commit-tree", expected, "-p", published, "-m", subject], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  return { target, drift: true, extra };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => {
    const at = process.argv.indexOf(name);
    return at === -1 ? undefined : process.argv[at + 1];
  };
  const published = arg("--published");
  const bump = arg("--bump");
  if (!published || !bump) {
    console.error("usage: release-tag-target.mjs --published <sha> --bump <sha>");
    process.exit(2);
  }
  console.log(JSON.stringify(releaseTagTarget({ published, bump })));
}
