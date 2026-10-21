// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BADGE_URLS,
  MARKER,
  buildButtonsHtml,
  buildGeneratedSection,
  buildPrompt,
  resolveKind,
  transformBody,
} from "./ai-spec-buttons.mjs";

// Every http(s) link in text. Substring checks on a URL also match an unrelated URL that
// contains it (for example "https://evil.example/?next=https://grok.com/"), so the tests
// compare whole links and hosts instead.
function links(text) {
  return [...text.matchAll(/https?:\/\/[^\s)"'<>\]]+/g)].map((m) => m[0]);
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

const url = "https://github.com/flisk-sh/flisk/issues/123";

const featureBody = [
  "### Is this a local-development or cluster-deployment request?",
  "",
  "Both / not sure",
  "",
  "### What problem are you trying to solve?",
  "",
  "Hard to parse doctor output.",
].join("\n");

const bugBody = [
  "### What happened?",
  "",
  "`flisk up` failed.",
  "",
  "### Steps to reproduce",
  "",
  "1. flisk up api",
].join("\n");

const docsBody = [
  "### What is wrong or missing?",
  "",
  "README omits WSL notes.",
].join("\n");

const adoptionBody = [
  "### What would you like to know?",
  "",
  "Would this fit our stack?",
  "",
  "### How do you run your services locally today?",
  "",
  "docker-compose",
].join("\n");

const bootBody = [
  "### Minutes until first healthy URL",
  "",
  "8",
  "",
  "### Commands you ran",
  "",
  "flisk project --yes",
].join("\n");

const weUseBody = [
  "### Anything a maintainer should know",
  "",
  "Private team.",
  "",
  "### I am allowed to list this organization",
  "",
  "- [x] yes",
].join("\n");

const premiumBody = [
  "### Which paid features do you need?",
  "",
  "- Sablier",
  "",
  "### What are you building with Flisk?",
  "",
  "Internal platform.",
].join("\n");

describe("buildPrompt", () => {
  it("openspec is one line with the issue URL", () => {
    assert.equal(
      buildPrompt("openspec", url),
      `Write an OpenSpec change for this issue. Read it at ${url}.`,
    );
  });

  it("primitive is one line, forbids OpenSpec, uses the issue URL", () => {
    assert.equal(
      buildPrompt("primitive", url),
      `Write a short spec for this issue. Read it at ${url}. Do not use OpenSpec.`,
    );
  });
});

describe("resolveKind", () => {
  it("classifies openspec from enhancement label", () => {
    assert.equal(resolveKind("anything", "enhancement", "T"), "openspec");
  });

  it("classifies openspec from feature form heading", () => {
    assert.equal(resolveKind(featureBody, "", "T"), "openspec");
  });

  it("lets enhancement win over bug", () => {
    assert.equal(resolveKind(bugBody, "bug,enhancement", "T"), "openspec");
  });

  it("classifies primitive from bug label", () => {
    assert.equal(resolveKind("plain", "bug", "T"), "primitive");
  });

  it("classifies primitive from documentation label", () => {
    assert.equal(resolveKind("plain", "documentation", "T"), "primitive");
  });

  it("classifies primitive from bug form heading", () => {
    assert.equal(resolveKind(bugBody, "", "T"), "primitive");
  });

  it("classifies primitive from docs form heading", () => {
    assert.equal(resolveKind(docsBody, "", "T"), "primitive");
  });

  it("skips blank / unlabeled issues with no kind signal", () => {
    assert.equal(resolveKind("just some notes", "", "T"), "skip");
    assert.equal(resolveKind("", "", "T"), "skip");
  });

  it("skips question label even with enhancement", () => {
    assert.equal(resolveKind(featureBody, "question,enhancement", "T"), "skip");
  });

  it("skips template titles", () => {
    assert.equal(resolveKind("x", "", "adopt: would this fit?"), "skip");
    assert.equal(resolveKind("x", "", "boot: first run"), "skip");
    assert.equal(resolveKind("x", "", "adopter: Acme"), "skip");
    assert.equal(resolveKind("x", "", "Premium license request: team"), "skip");
  });

  it("skips template bodies only when two headings from one template match", () => {
    assert.equal(resolveKind(adoptionBody, "", "T"), "skip");
    assert.equal(resolveKind(bootBody, "", "T"), "skip");
    assert.equal(resolveKind(weUseBody, "", "T"), "skip");
    assert.equal(resolveKind(premiumBody, "", "T"), "skip");
  });

  it("does not skip a bug body that casually mentions one skip phrase", () => {
    const body = [
      "### What happened?",
      "",
      "Mentioned that I would like to know how ports work,",
      "and also what are you building with Flisk? as a joke.",
    ].join("\n");
    assert.equal(resolveKind(body, "", "T"), "primitive");
  });
});

describe("buildButtonsHtml", () => {
  it("uses shared circle SVGs on main, tool-name alt text, one-line query", () => {
    const html = buildButtonsHtml("openspec", url);
    assert.equal(BADGE_URLS.grok, "https://github.com/flisk-sh/flisk/raw/main/.github/badges/grok.svg");
    assert.equal(BADGE_URLS.claude, "https://github.com/flisk-sh/flisk/raw/main/.github/badges/claude.svg");
    assert.equal(BADGE_URLS.codex, "https://github.com/flisk-sh/flisk/raw/main/.github/badges/codex.svg");
    assert.ok(html.includes("[![Grok]("));
    assert.ok(html.includes("[![Claude]("));
    assert.ok(html.includes("[![Codex]("));
    assert.ok(!html.includes("Write spec in Grok"));
    assert.ok(!html.includes("Review PR in"));
    const q = encodeURIComponent(buildPrompt("openspec", url));
    assert.ok(html.includes(`https://grok.com/?q=${q}`));
    assert.ok(html.includes(`https://claude.ai/new?q=${q}`));
    assert.ok(html.includes(`https://chatgpt.com/?q=${q}`));
    assert.ok(!html.includes("%0A"));
    assert.ok(!linkHosts(html).some((host) => host === "img.shields.io"));
    // One row: badges separated by &nbsp;, never by newlines.
    assert.ok(html.includes(")&nbsp;[![Claude]"));
    assert.ok(html.includes(")&nbsp;[![Codex]"));
    assert.ok(!html.includes("\n"));
  });
});

describe("buildGeneratedSection", () => {
  it("issue tail is label + three circles, no prompt paragraph", () => {
    const section = buildGeneratedSection("openspec", url);
    assert.ok(section.startsWith(MARKER));
    assert.ok(section.includes("**Write a spec in**"));
    const lines = section.split("\n");
    const heading = lines.indexOf("**Write a spec in**");
    assert.ok(heading !== -1);
    assert.ok(lines[heading + 1].startsWith("[![Grok]("));
    assert.ok(lines[heading + 1].includes("&nbsp;[![Claude]"));
    assert.ok(lines[heading + 1].includes("&nbsp;[![Codex]"));
    assert.ok(section.includes("grok.svg") && section.includes("claude.svg") && section.includes("codex.svg"));
    assert.ok(!section.includes("drafts an OpenSpec"));
    assert.ok(!section.includes("Nothing is posted back"));
  });
});

describe("transformBody", () => {
  it("appends OpenSpec buttons for enhancement issues", () => {
    const r = transformBody("Author\n", "T", url, "enhancement");
    assert.equal(r.action, "patch");
    assert.equal(r.kind, "openspec");
    assert.ok(r.body.includes(MARKER));
    assert.ok(r.body.includes("**Write a spec in**"));
    assert.ok(r.body.startsWith("Author"));
    assert.ok(r.body.includes(encodeURIComponent(buildPrompt("openspec", url))));
  });

  it("appends short-spec buttons for bug issues", () => {
    const r = transformBody(bugBody, "T", url, "bug");
    assert.equal(r.action, "patch");
    assert.equal(r.kind, "primitive");
    assert.ok(r.body.includes(encodeURIComponent(buildPrompt("primitive", url))));
    assert.ok(!r.body.includes("openspec/changes"));
  });

  it("skips blank issues and leaves any existing marker alone", () => {
    const withMarker = `Notes\n\n${buildGeneratedSection("openspec", url)}`;
    const r = transformBody(withMarker, "Renamed", url, "");
    assert.equal(r.action, "skip");
    assert.equal(r.body, withMarker);
  });

  it("regenerates tail when kind changes via labels", () => {
    const rOpen = transformBody("Author\n", "T", url, "enhancement");
    const rBug = transformBody(rOpen.body, "T", url, "bug");
    assert.equal(rBug.action, "patch");
    assert.ok(rBug.body.startsWith("Author"));
    assert.ok(rBug.body.includes(encodeURIComponent(buildPrompt("primitive", url))));
    assert.ok(!rBug.body.includes(encodeURIComponent(buildPrompt("openspec", url))));
  });

  it("skips when tail already matches", () => {
    const r1 = transformBody("Author\n", "T", url, "bug");
    const r2 = transformBody(r1.body, "T", url, "bug");
    assert.equal(r2.action, "skip");
    assert.equal(r2.body, r1.body);
  });

  it("skips when url is missing", () => {
    assert.equal(transformBody("x\n", "T", "", "bug").action, "skip");
  });
});
