// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// The table is built by the script inlined in the workflow, so run that exact text.
function workflowScript() {
  const lines = readFileSync(
    new URL("../.github/workflows/hall-of-fame.yml", import.meta.url),
    "utf8",
  ).split("\n");
  const start = lines.findIndex((line) => line.trim() === "script: |");
  assert.notEqual(start, -1, "hall-of-fame.yml has no github-script step");
  return lines.slice(start + 1).join("\n");
}

function pr(login, authorAssociation, typename = "User") {
  return {
    number: 1,
    author: { login, __typename: typename },
    authorAssociation,
    closingIssuesReferences: { nodes: [] },
  };
}

// Runs the workflow script over one page of merged PRs and returns the issue body it writes.
async function rebuild(nodes) {
  const AsyncFunction = (async () => {}).constructor;
  const created = [];
  const github = {
    graphql: async () => ({
      repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } },
    }),
    paginate: async () => [],
    rest: {
      issues: {
        listForRepo: () => {},
        create: async (args) => created.push(args),
        update: async () => assert.fail("nothing to update: no issue exists yet"),
      },
      repos: {
        getContents: async () => ({
          data: { content: Buffer.from("readme").toString("base64"), sha: "a" },
        }),
        putContents: async () => {},
      },
    },
  };
  const context = { repo: { owner: "flisk-sh", repo: "flisk" } };
  const core = { warning: () => {} };
  await new AsyncFunction("github", "context", "core", workflowScript())(github, context, core);
  assert.equal(created.length, 1);
  return created[0].body;
}

const rowFor = (body, login) => body.split("\n").find((line) => line.startsWith(`| @${login} |`));

describe("hall of fame table", () => {
  it("lists a collaborator with write access and counts every merged PR", async () => {
    const body = await rebuild([pr("AK-Lmn", "COLLABORATOR"), pr("AK-Lmn", "COLLABORATOR")]);
    const row = rowFor(body, "AK-Lmn");
    assert.ok(row, "collaborator has no row");
    assert.equal(row.split("|")[3].trim(), "2");
  });

  it("still lists outside contributors", async () => {
    const body = await rebuild([
      pr("first-timer", "FIRST_TIME_CONTRIBUTOR"),
      pr("regular", "CONTRIBUTOR"),
    ]);
    assert.ok(rowFor(body, "first-timer"));
    assert.ok(rowFor(body, "regular"));
  });

  it("leaves out the org, named maintainers and bots", async () => {
    const body = await rebuild([
      pr("org-owner", "OWNER"),
      pr("org-member", "MEMBER"),
      pr("kburym", "CONTRIBUTOR"),
      pr("odykyi", "COLLABORATOR"),
      pr("dependabot", "CONTRIBUTOR", "Bot"),
      pr("regular", "CONTRIBUTOR"),
    ]);
    for (const login of ["org-owner", "org-member", "kburym", "odykyi", "dependabot"]) {
      assert.equal(rowFor(body, login), undefined, `${login} should not have a row`);
    }
    assert.match(body, /Last updated for the 1 contributors above/);
  });
});
