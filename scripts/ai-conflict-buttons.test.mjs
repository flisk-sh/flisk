// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MARKER,
  buildButtonsHtml,
  buildComment,
  buildPrompt,
  closingIssue,
} from "./ai-conflict-buttons.mjs";

// Every http(s) link in text. Substring checks on a URL also match an unrelated URL that
// contains it (for example "https://evil.example/?next=https://grok.com/"), so the tests
// compare whole links and hosts instead.
function links(text) {
  return [...text.matchAll(/https?:\/\/[^\s)"'<>\]]+/g)].map((m) => m[0].replace(/[.,;:!?]+$/, ""));
}

function linkHosts(text) {
  return links(text).map((link) => {
    try {
      return new URL(link).hostname;
    } catch {
      return "";
    }
  });
}

const url = "https://github.com/flisk-sh/flisk/pull/645";

describe("closingIssue", () => {
  it("reads the first closing reference", () => {
    assert.equal(closingIssue("Fixes #449\n"), "449");
    assert.equal(closingIssue("See #12. Closes #8."), "8");
    assert.equal(closingIssue("no closing line"), "");
  });
});

describe("buildPrompt", () => {
  it("names the PR, fork, branch, and closing issue", () => {
    const prompt = buildPrompt({
      prUrl: url,
      headOwner: "xiehuanyi",
      headBranch: "feat/ui-keyboard-navigation-round2",
      baseBranch: "main",
      prNumber: 645,
      body: "Fixes #449.\n",
    });
    assert.ok(links(prompt).some((link) => link === url));
    assert.ok(prompt.includes("Fetch xiehuanyi feat/ui-keyboard-navigation-round2"));
    assert.ok(prompt.includes("merge origin/main"));
    assert.ok(prompt.includes("Keep the changes from that branch. Keep main's changes."));
    assert.ok(prompt.includes("Rebuild cli/dist."));
    assert.ok(prompt.includes("Push to feat/ui-keyboard-navigation-round2 if allowed"));
    assert.ok(prompt.includes("fix/645-conflict"));
    assert.ok(prompt.includes("Fixes #449"));
    assert.ok(!prompt.includes("\n"));
  });

  it("omits a closing line when the body has none", () => {
    const prompt = buildPrompt({
      prUrl: url,
      headOwner: "odykyi",
      headBranch: "fix/thing",
      baseBranch: "release",
      prNumber: 7,
      body: "no issue",
    });
    assert.ok(prompt.includes("merge origin/release"));
    assert.ok(prompt.includes("Keep release's changes."));
    assert.ok(prompt.includes("open a replacement PR."));
    assert.ok(!prompt.includes("Fixes #"));
  });
});

describe("buildButtonsHtml", () => {
  it("keeps Grok, Claude, and Codex on one line", () => {
    const html = buildButtonsHtml("Resolve the merge conflict.");
    assert.ok(html.includes(")&nbsp;[![Claude]"));
    assert.ok(html.includes(")&nbsp;[![Codex]"));
    assert.ok(!html.includes("\n"));
    assert.ok(html.includes("https://grok.com/?q="));
    assert.ok(html.includes("https://claude.ai/new?q="));
    assert.ok(html.includes("https://chatgpt.com/?q="));
    assert.ok(html.includes("Resolve%20conflict-111111"));
    assert.ok(html.includes("logo=x"));
    assert.ok(html.includes("logo=anthropic"));
    assert.ok(html.includes("logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2C"));
    const codexSrc = html.match(/\[!\[Codex\]\(([^)]+)\)/)?.[1] ?? "";
    const logoParam = new URL(codexSrc).searchParams.get("logo") ?? "";
    const decoded = Buffer.from(logoParam.split("base64,")[1] ?? "", "base64").toString("utf8");
    assert.ok(decoded.includes('fill="#fff"'));
    assert.ok(decoded.includes('viewBox="0 0 24 24"'));
  });
});

describe("buildComment", () => {
  const input = {
    prUrl: url,
    headOwner: "xiehuanyi",
    headBranch: "feat/ui-keyboard-navigation-round2",
    baseBranch: "main",
    prNumber: 645,
    body: "Fixes #449.",
  };

  it("writes the conflict text and a one-line button row", () => {
    const comment = buildComment({ ...input, conflicting: true });
    assert.ok(comment.startsWith(MARKER));
    assert.ok(comment.includes("This pull request conflicts with `main`."));
    const lines = comment.split("\n");
    const heading = lines.indexOf("# Resolve this conflict in");
    assert.ok(heading !== -1);
    assert.ok(lines[heading + 1].startsWith("[![Grok]("));
    assert.ok(lines[heading + 1].includes("&nbsp;[![Claude]"));
    assert.ok(lines[heading + 1].includes("&nbsp;[![Codex]"));
    assert.ok(comment.includes(encodeURIComponent(buildPrompt(input))));
  });

  it("drops the buttons once the PR is mergeable", () => {
    const comment = buildComment({ ...input, conflicting: false });
    assert.ok(comment.startsWith(MARKER));
    assert.ok(comment.includes("no longer conflicts"));
    assert.ok(!linkHosts(comment).some((host) => host === "grok.com"));
    assert.ok(!comment.includes("# Resolve this conflict in"));
  });
});
