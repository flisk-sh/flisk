// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// The publish gate in release-binaries.yml (#1627). A release may publish only a commit that a passing Release candidate
// (release-candidate.yml) has checked. The exact commit is the first choice. When the release commit has moved on from the
// candidate, a passing candidate on an ancestor still counts if no commit between them changed a release input: the shipped
// package is then the one the candidate checked. Any change to a release input needs a new candidate on that commit.
//   node scripts/check-release-candidate.mjs --sha <commit> [--repo owner/name]   (GH_TOKEN must be set)
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The same paths the `changes` job of release-binaries.yml filters on. Keep the two lists in step.
export const RELEASE_INPUTS = [
  ".github/workflows/release-binaries.yml",
  "package.json",
  "bun.lock",
  "cli/**",
  "scripts/release-binaries.sh",
  "Tiltfile",
  "engine/**",
  "discovery/**",
  "specs/**",
  "ext/**",
  "shared-platform-engineering/docker-templates/**",
];

// GitHub's compare API returns at most this many files. A list at the cap may be cut short, so it cannot prove anything.
export const COMPARE_FILE_CAP = 300;

// Candidates examined per gate run. Each one costs one compare call.
const MAX_CANDIDATES = 20;

// Only two forms appear in RELEASE_INPUTS: an exact path, or a directory followed by "/**". Anything else is a bug in
// the list, so it throws rather than being guessed at.
const matchesInput = (glob, file) => {
  if (glob.endsWith("/**")) {
    return file.startsWith(glob.slice(0, -2));
  }
  if (glob.includes("*")) {
    throw new Error(`unsupported release input pattern: ${glob}`);
  }
  return file === glob;
};

// The release input a changed path falls under, or undefined when the path cannot change the shipped package.
export const releaseInputFor = (file) => RELEASE_INPUTS.find((glob) => matchesInput(glob, file));

// Decides whether a candidate commit covers the release commit. `compare(base, head)` returns
// { status, files } from the compare API, where status "ahead" means head contains base.
export const checkCandidates = ({ sha, candidates, compare }) => {
  const reasons = [];
  if (candidates.includes(sha)) {
    return { ok: true, candidate: sha, reason: "exact" };
  }
  for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
    const { status, files } = compare(candidate, sha);
    if (status !== "ahead") {
      reasons.push(`${candidate.slice(0, 9)}: not an ancestor of ${sha.slice(0, 9)} (${status})`);
      continue;
    }
    if (files.length >= COMPARE_FILE_CAP) {
      reasons.push(`${candidate.slice(0, 9)}: ${files.length} changed files, too many to check`);
      continue;
    }
    const changed = [...new Set(files.flatMap((f) => [f.filename, f.previous_filename].filter(Boolean)))];
    const inputs = [...new Set(changed.map(releaseInputFor).filter(Boolean))];
    if (inputs.length === 0) {
      return { ok: true, candidate, reason: "ancestor", changed: changed.length };
    }
    reasons.push(`${candidate.slice(0, 9)}: release inputs changed since (${inputs.join(", ")})`);
  }
  return { ok: false, reasons };
};

const gh = (...args) => execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

const main = () => {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const sha = flag("--sha") ?? process.env.SHA;
  const repo = flag("--repo") ?? process.env.GITHUB_REPOSITORY;
  if (!sha || !repo) {
    console.error("usage: check-release-candidate.mjs --sha <commit> --repo <owner/name>");
    process.exit(2);
  }
  const runs = JSON.parse(
    gh(`repos/${repo}/actions/workflows/release-candidate.yml/runs?per_page=100&status=success`),
  ).workflow_runs;
  // Newest first, one entry per commit.
  const candidates = [...new Set(runs.filter((r) => r.conclusion === "success").map((r) => r.head_sha))];
  const compare = (base, head) => {
    const data = JSON.parse(gh(`repos/${repo}/compare/${base}...${head}?per_page=${COMPARE_FILE_CAP}`));
    return { status: data.status, files: data.files ?? [] };
  };
  const result = checkCandidates({ sha, candidates, compare });
  if (result.ok) {
    const note = result.reason === "exact"
      ? `Release candidate passed for ${sha}.`
      : `Release candidate ${result.candidate} passed. ${sha} changes no release input since it (${result.changed} file(s) changed).`;
    console.log(note);
    return;
  }
  console.error(`::error::No passing Release candidate covers ${sha}.`);
  for (const reason of result.reasons) console.error(`  - ${reason}`);
  console.error(
    "Run the Release candidate workflow on this commit (a release/* branch or an rc-* tag), let it pass, then re-run this publish.",
  );
  process.exit(1);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
