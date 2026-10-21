// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MARKER,
  buildButtonsHtml,
  buildGeneratedSection,
  buildPrompt,
  transformBody,
} from "./ai-review-buttons.mjs";

const url = "https://github.com/flisk-sh/tdk-cli-core/pull/123";

describe("buildPrompt", () => {
  it("is one line with the PR URL only", () => {
    assert.equal(
      buildPrompt(url),
      `Review this pull request. Read the title and diff at ${url}.`,
    );
  });
});

describe("buildButtonsHtml", () => {
  it("uses product-name badges with logos, joined on one line", () => {
    const html = buildButtonsHtml(url);
    assert.ok(html.includes("[![Grok]("));
    assert.ok(html.includes("[![Claude]("));
    assert.ok(html.includes("[![Codex]("));
    assert.ok(html.includes("img.shields.io/badge/Grok-111111"));
    assert.ok(html.includes("img.shields.io/badge/Claude-D97757"));
    assert.ok(html.includes("img.shields.io/badge/Codex-10A37F"));
    assert.ok(html.includes("style=for-the-badge&logo=x"));
    assert.ok(html.includes("style=for-the-badge&logo=anthropic"));
    // Shields dropped the openai slug; Codex uses an embedded white mark.
    assert.ok(!html.includes("logo=openai"));
    assert.ok(html.includes("logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2C"));
    const codexSrc = html.match(/\[!\[Codex\]\(([^)]+)\)/)?.[1] ?? "";
    const logoParam = new URL(codexSrc).searchParams.get("logo") ?? "";
    const decoded = Buffer.from(logoParam.split("base64,")[1] ?? "", "base64").toString("utf8");
    assert.ok(decoded.includes('fill="#fff"'));
    assert.ok(decoded.includes('viewBox="0 0 24 24"'));
    assert.ok(!html.includes("Review PR in"));
    assert.ok(!html.includes("grok.svg"));
    const q = encodeURIComponent(buildPrompt(url));
    assert.ok(html.includes(`https://grok.com/?q=${q}`));
    assert.ok(html.includes(`https://claude.ai/new?q=${q}`));
    assert.ok(html.includes(`https://chatgpt.com/?q=${q}`));
    // One row: badges separated by &nbsp;, never by newlines.
    assert.ok(html.includes(")&nbsp;[![Claude]"));
    assert.ok(html.includes(")&nbsp;[![Codex]"));
    assert.ok(!html.includes("\n"));
  });
});

describe("buildGeneratedSection", () => {
  it("heading then badges on the next line, no blank line between them", () => {
    const section = buildGeneratedSection(url);
    assert.ok(section.startsWith(MARKER));
    const lines = section.split("\n");
    const heading = lines.indexOf("# Review this PR in");
    assert.ok(heading !== -1);
    assert.ok(lines[heading + 1].startsWith("[![Grok]("));
    assert.ok(lines[heading + 1].includes("&nbsp;[![Claude]"));
    assert.ok(lines[heading + 1].includes("&nbsp;[![Codex]"));
    assert.equal(lines[heading + 1].includes("\n"), false);
    assert.ok(!section.includes("**Review this PR in**"));
    assert.ok(!section.includes("# Review this PR in&nbsp;"));
    assert.ok(!section.includes("AI review**"));
    assert.ok(!section.includes("Nothing is posted back"));
    assert.ok(section.includes("If this helps, please ⭐ [star tdk-cli-core](https://github.com/flisk-sh/tdk-cli-core)</sub>"));
  });
});

describe("transformBody", () => {
  it("appends review buttons for a new PR body", () => {
    const r = transformBody("Author\n", url);
    assert.equal(r.action, "patch");
    assert.ok(r.body.includes(MARKER));
    assert.ok(r.body.includes("# Review this PR in\n[![Grok]("));
    assert.ok(r.body.startsWith("Author"));
    assert.ok(r.body.includes(encodeURIComponent(buildPrompt(url))));
    assert.ok(r.body.includes("please ⭐ [star tdk-cli-core](https://github.com/flisk-sh/tdk-cli-core)"));
  });

  it("regenerates an existing section when it lacks the star footer", () => {
    const current = buildGeneratedSection(url).replace(/\n<sub>Shared by[\s\S]*$/, "");
    const r = transformBody(`Author\n\n${current}`, url);
    assert.equal(r.action, "patch");
    assert.ok(r.body.startsWith("Author"));
    assert.ok(r.body.includes("please ⭐ [star tdk-cli-core](https://github.com/flisk-sh/tdk-cli-core)"));
  });

  it("skips when the tail already matches", () => {
    const r1 = transformBody("Author\n", url);
    const r2 = transformBody(r1.body, url);
    assert.equal(r2.action, "skip");
    assert.equal(r2.body, r1.body);
  });

  it("regenerates when the PR URL changes", () => {
    const r1 = transformBody("Author\n", url);
    const other = "https://github.com/flisk-sh/tdk-cli-core/pull/999";
    const r2 = transformBody(r1.body, other);
    assert.equal(r2.action, "patch");
    assert.ok(r2.body.startsWith("Author"));
    assert.ok(r2.body.includes(encodeURIComponent(buildPrompt(other))));
  });

  it("skips when url is missing", () => {
    assert.equal(transformBody("x\n", "").action, "skip");
  });
});
