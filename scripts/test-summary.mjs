// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// One pull request comment with unit test counts, failed test names, E2E results, coverage against the ratchet baseline
// and a link to the run's logs and artifacts (#1385). Reads only JSON: the Vitest JSON reporter output, the coverage
// summary and the JSON report of cli/scripts/coverage-ratchet.mjs. Log text is never parsed.
//
// The comment carries MARKER. --post finds the bot's comment with it and edits that comment on every run, so a PR has one
// summary no matter how many pushes it gets. The Markdown goes to stdout in both modes.
//
//   node scripts/test-summary.mjs --unit <dir> [--test-result <job result>] [--run-url <url>]
//       [--repo <owner/name> --sha <head sha>] [--e2e-json <file>] [--pr <number> --post]
//
// --unit holds vitest.json, coverage-summary.json and coverage-ratchet.json (written by the Test job).
// --repo and --sha fetch the E2E workflow runs of that commit with gh; --e2e-json reads them from a file instead.
// Needs GH_TOKEN for --post and for the E2E lookup.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "<!-- tdk-test-summary -->";
const MAX_FAILED = 20;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RESULT_ICON = {
  success: "✅",
  failure: "❌",
  cancelled: "⚪",
  skipped: "⏭️",
  timed_out: "❌",
  in_progress: "⏳",
  queued: "⏳",
  waiting: "⏳",
  pending: "⏳",
  requested: "⏳",
};

function readJsonIfPresent(file) {
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

// Counts from the Vitest JSON reporter. Skipped means pending plus todo, as the Vitest summary line reports them.
export function unitCounts(vitest) {
  const results = vitest.testResults ?? [];
  const failed = [];
  const suiteErrors = [];
  for (const file of results) {
    const failedHere = (file.assertionResults ?? []).filter((test) => test.status === "failed");
    for (const test of failedHere) {
      failed.push({
        file: relative(file.name),
        name: test.fullName,
        message: firstLine(test.failureMessages?.[0]),
      });
    }
    if (file.status === "failed" && failedHere.length === 0) {
      suiteErrors.push({ file: relative(file.name), message: firstLine(file.message) });
    }
  }
  return {
    total: vitest.numTotalTests ?? 0,
    pass: vitest.numPassedTests ?? 0,
    fail: vitest.numFailedTests ?? 0,
    skip: (vitest.numPendingTests ?? 0) + (vitest.numTodoTests ?? 0),
    failed,
    suiteErrors,
  };
}

function firstLine(text) {
  if (typeof text !== "string" || text.trim() === "") return "";
  const line = text.trim().split("\n")[0];
  return line.length > 240 ? `${line.slice(0, 237)}...` : line;
}

// Per-area coverage with the baseline floor, from the ratchet's JSON report.
export function areaRows(ratchet) {
  return Object.entries(ratchet?.areas ?? {}).map(([name, area]) => ({
    name,
    files: area.files,
    lines: area.metrics.lines,
    branches: area.metrics.branches,
  }));
}

// E2E workflow runs: the newest run of each workflow file in the CI inventory's e2e tier, for this commit.
export function e2eRuns(runs, inventory) {
  const paths = new Set(
    (inventory.jobs ?? [])
      .filter((job) => job.tier === "e2e")
      .map((job) => `.github/workflows/${job.workflow}`),
  );
  const seen = new Map();
  for (const run of runs) {
    if (!paths.has(run.path) || seen.has(run.path)) continue;
    seen.set(run.path, {
      path: run.path,
      name: run.name,
      result: run.conclusion ?? run.status ?? "pending",
      url: run.html_url,
    });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function isFailing({ unit, ratchet, testResult }) {
  if (testResult && !["success", "skipped"].includes(testResult)) return true;
  if (unit && (unit.fail > 0 || unit.suiteErrors.length > 0)) return true;
  return Boolean(ratchet && ratchet.failures.length > 0);
}

// Whether to create or edit the comment. A PR with no summary yet gets one only when something failed, so a green PR
// with no coverage change stays quiet. Once a summary exists, it is kept current on every run.
export function shouldPost({ existing, failing }) {
  return existing || failing;
}

const signed = (value) => (value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2));

export function render({ unit, ratchet, coverage, e2e, testResult, runUrl, sha }) {
  const failing = isFailing({ unit, ratchet, testResult });
  const lines = [
    MARKER,
    `### ${failing ? "❌" : "✅"} Test summary for \`${sha.slice(0, 7)}\``,
    "",
  ];

  lines.push("**Unit tests (Vitest)**", "");
  if (unit) {
    lines.push("| Pass | Fail | Skip | Total |", "|---:|---:|---:|---:|");
    lines.push(`| ${unit.pass} | ${unit.fail} | ${unit.skip} | ${unit.total} |`, "");
  } else {
    lines.push(
      "Not produced: the Test job stopped before its unit test report step. See the run.",
      "",
    );
  }

  const problems = [...(unit?.failed ?? []), ...(unit?.suiteErrors ?? [])];
  if (problems.length > 0) {
    const shown = problems.slice(0, MAX_FAILED).map((problem) => {
      const label = problem.name
        ? `\`${problem.file}\` › ${problem.name}`
        : `\`${problem.file}\` (file failed to run)`;
      return problem.message ? `- ${label}<br>${escapeHtml(problem.message)}` : `- ${label}`;
    });
    const more =
      problems.length > MAX_FAILED ? [`- …and ${problems.length - MAX_FAILED} more`] : [];
    lines.push(
      `<details><summary>Failed tests (${problems.length})</summary>`,
      "",
      ...shown,
      ...more,
      "",
      "</details>",
      "",
    );
  }

  lines.push("**Coverage (lines / branches, against the per-area baseline)**", "");
  if (ratchet) {
    lines.push(
      "| Area | Files | Lines | Δ vs baseline | Branches | Δ vs baseline |",
      "|---|---:|---:|---:|---:|---:|",
    );
    for (const row of areaRows(ratchet)) {
      lines.push(
        `| ${row.name} | ${row.files} | ${cell(row.lines)} | ${delta(row.lines)} | ${cell(row.branches)} | ${delta(row.branches)} |`,
      );
    }
    lines.push("");
  }
  if (coverage) {
    lines.push(
      `Whole CLI: lines ${coverage.lines.pct}% (${coverage.lines.covered}/${coverage.lines.total}), branches ${coverage.branches.pct}%.`,
      "",
    );
  }
  if (!ratchet && !coverage) {
    lines.push("Not produced: the coverage report did not finish. See the run.", "");
  }

  lines.push("**E2E**", "");
  if (e2e === null) {
    lines.push("Not collected for this run.", "");
  } else if (e2e.length === 0) {
    lines.push("No E2E workflow has run for this commit yet.", "");
  } else {
    lines.push("| Workflow | Result | Run |", "|---|---|---|");
    for (const run of e2e) {
      lines.push(
        `| ${run.name} | ${RESULT_ICON[run.result] ?? "❔"} ${run.result} | [open](${run.url}) |`,
      );
    }
    lines.push(
      "",
      "_An E2E workflow still running when this comment was written shows as pending until the next push._",
      "",
    );
  }

  lines.push(
    `**Logs and artifacts:** [workflow run](${runUrl}). The run page has the job logs, the \`unit-test-results\` and \`cli-coverage-html\` artifacts, and any E2E evidence bundles.`,
    "",
    `_Updated ${new Date().toISOString()} by scripts/test-summary.mjs._`,
  );
  return `${lines.join("\n")}\n`;
}

function cell(metric) {
  return metric.actual === undefined ? "n/a" : `${metric.actual.toFixed(2)}%`;
}

function delta(metric) {
  if (metric.actual === undefined || metric.baseline === null || metric.baseline === undefined)
    return "n/a";
  return `${signed(metric.actual - metric.baseline)} pts`;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function gh(args, input) {
  return execFileSync("gh", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });
}

// The workflow runs of this commit, newest first, from the Actions API.
export function fetchRuns(repo, sha) {
  const out = gh([
    "api",
    `repos/${repo}/actions/runs?head_sha=${sha}&event=pull_request&per_page=100`,
  ]);
  return JSON.parse(out).workflow_runs ?? [];
}

// Creates the comment, or edits the bot's comment that carries MARKER. Returns the comment's URL.
export function upsert({ repo, pr, body, existingId }) {
  if (existingId) {
    const out = gh(
      ["api", "-X", "PATCH", `repos/${repo}/issues/comments/${existingId}`, "--input", "-"],
      JSON.stringify({ body }),
    );
    return JSON.parse(out).html_url;
  }
  const out = gh(
    ["api", "-X", "POST", `repos/${repo}/issues/${pr}/comments`, "--input", "-"],
    JSON.stringify({ body }),
  );
  return JSON.parse(out).html_url;
}

// The id of the bot's existing summary comment on the PR, or null. Only comments authored by a Bot are considered, so a
// person quoting the marker cannot capture the summary.
export function findExistingId(repo, pr) {
  const out = gh([
    "api",
    "--paginate",
    `repos/${repo}/issues/${pr}/comments`,
    "--jq",
    `.[] | select(.body | contains("${MARKER}")) | select(.user.type == "Bot") | .id`,
  ]);
  const first = out.split("\n").find((line) => line.trim() !== "");
  return first ? Number(first.trim()) : null;
}

function parseArgs(argv) {
  const opts = {
    unit: null,
    testResult: "",
    runUrl: "",
    repo: "",
    sha: "",
    e2eJson: null,
    pr: "",
    post: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => argv[++i];
    if (arg === "--unit") opts.unit = path.resolve(value());
    else if (arg === "--test-result") opts.testResult = value();
    else if (arg === "--run-url") opts.runUrl = value();
    else if (arg === "--repo") opts.repo = value();
    else if (arg === "--sha") opts.sha = value();
    else if (arg === "--e2e-json") opts.e2eJson = path.resolve(value());
    else if (arg === "--pr") opts.pr = value();
    else if (arg === "--post") opts.post = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!opts.unit) throw new Error("--unit <dir> is required");
  if (opts.post && (!opts.repo || !opts.pr)) throw new Error("--post needs --repo and --pr");
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const vitest = readJsonIfPresent(path.join(opts.unit, "vitest.json"));
  const ratchet = readJsonIfPresent(path.join(opts.unit, "coverage-ratchet.json"));
  const coverage = readJsonIfPresent(path.join(opts.unit, "coverage-summary.json"))?.total ?? null;
  const unit = vitest ? unitCounts(vitest) : null;

  let e2e = null;
  if (opts.e2eJson) {
    e2e = e2eRuns(JSON.parse(readFileSync(opts.e2eJson, "utf8")), inventory());
  } else if (opts.repo && opts.sha) {
    e2e = e2eRuns(fetchRuns(opts.repo, opts.sha), inventory());
  }

  const body = render({
    unit,
    ratchet,
    coverage,
    e2e,
    testResult: opts.testResult,
    runUrl: opts.runUrl,
    sha: opts.sha || "local",
  });

  // The Markdown always goes to stdout (the job summary); --post also writes it to the PR.
  process.stdout.write(body);
  if (!opts.post) return;
  const existingId = findExistingId(opts.repo, opts.pr);
  const failing = isFailing({ unit, ratchet, testResult: opts.testResult });
  if (!shouldPost({ existing: existingId !== null, failing })) {
    console.error("test-summary: all checks passed and no summary exists yet; no comment posted");
    return;
  }
  const url = upsert({ repo: opts.repo, pr: opts.pr, body, existingId });
  console.error(`test-summary: ${existingId ? "updated" : "created"} ${url}`);
}

function inventory() {
  return JSON.parse(readFileSync(path.join(ROOT, ".github", "ci-inventory.json"), "utf8"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
