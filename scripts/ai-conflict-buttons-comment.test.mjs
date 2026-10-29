// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(ROOT, "scripts", "ai-conflict-buttons-comment.sh");

// Fake `gh`: logs every call, answers by argument shape, saves stdin of POST/PATCH.
const GH_STUB = `#!/usr/bin/env bash
echo "$*" >> "$GH_LOG"
case "$*" in
  *"--method POST"*|*"--method PATCH"*) cat > "$GH_STDIN" ;;
  *"--paginate"*) printf '%s' "\${GH_COMMENT_ID:-}" ;;
  *mergeable_state*) printf '%s\\n' "$GH_STATE" ;;
  *) printf '%s\\n' "$GH_PR_BODY" ;;
esac
`;

function run({ state = "dirty", commentId = "", omit = [], extra = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "flisk-conflict-comment-"));
  try {
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "gh"), GH_STUB, { mode: 0o755 });
    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      RUNNER_TEMP: dir,
      GH_LOG: join(dir, "gh.log"),
      GH_STDIN: join(dir, "gh-stdin.json"),
      GH_STATE: state,
      GH_COMMENT_ID: commentId,
      GH_PR_BODY: "Fixes #123",
      PR_NUMBER: "2365",
      PR_URL: "https://github.com/acme/flisk/pull/2365",
      HEAD_OWNER: "octocat",
      HEAD_BRANCH: "feature",
      BASE_BRANCH: "main",
      GITHUB_REPOSITORY: "acme/flisk",
      ...extra,
    };
    for (const key of omit) delete env[key];
    const result = spawnSync("bash", [SCRIPT], { cwd: ROOT, env, encoding: "utf8", timeout: 30_000 });
    const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
    return { ...result, log: read("gh.log"), posted: read("gh-stdin.json") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("posts the conflict comment for a conflicting PR", () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.log, /--method POST repos\/acme\/flisk\/issues\/2365\/comments/);
  const { body } = JSON.parse(r.posted);
  assert.ok(body.startsWith("<!-- ai-conflict-buttons -->"));
  assert.match(body, /This pull request conflicts with `main`\./);
  assert.match(body, /# Resolve this conflict in/);
  for (const link of ["https://grok.com/?q=", "https://claude.ai/new?q=", "https://chatgpt.com/?q="]) {
    assert.ok(body.includes(link), `missing button link ${link}`);
  }
  assert.match(body, /pull%2F2365/); // PR URL carried into the prompt
  assert.match(body, /Fixes%20%23123/); // closing issue carried into the prompt
});

test("exits non-zero when no PR number is given", () => {
  const r = run({ omit: ["PR_NUMBER"] });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /PR_NUMBER/);
  assert.equal(r.log, ""); // gh was never called
});