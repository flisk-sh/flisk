// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// The comments are built by the script inlined in the workflow, so run that exact text.
function workflowScript() {
  const lines = readFileSync(
    new URL("../.github/workflows/contributor-merged.yml", import.meta.url),
    "utf8",
  ).split("\n");
  const start = lines.findIndex((line) => line.trim() === "script: |");
  assert.notEqual(start, -1, "contributor-merged.yml has no github-script step");
  return lines.slice(start + 1).join("\n");
}

const labels = (...names) => ({ nodes: names.map((name) => ({ name })) });

// Runs the workflow script for one merged PR and returns the comments it posts, keyed by number.
async function run({ issueLabels = [], priorIssueLabels = null, claimTemplate = null }) {
  const AsyncFunction = (async () => {}).constructor;
  const posted = {};
  const pr = {
    number: 50,
    merged: true,
    user: { login: "newcomer", type: "User" },
    labels: [],
    base: { ref: "main" },
    merge_commit_sha: "0fd0fb190a9ad0c4d0647be02db73816356c8016",
  };
  const prior = priorIssueLabels
    ? [{ number: 40, closingIssuesReferences: { nodes: [{ labels: labels(...priorIssueLabels) }] } }]
    : [];
  const github = {
    graphql: async (query) =>
      query.includes("search(")
        ? { search: { nodes: [{ number: 50, closingIssuesReferences: { nodes: [] } }, ...prior] } }
        : {
            repository: {
              pullRequest: {
                closingIssuesReferences: {
                  nodes: [{ number: 7, title: "t", state: "CLOSED", labels: labels(...issueLabels) }],
                },
              },
            },
          },
    paginate: async () => [],
    rest: {
      issues: {
        listForRepo: () => {},
        listComments: () => {},
        createComment: async ({ issue_number, body }) => {
          posted[issue_number] = body;
        },
      },
      search: {
        issuesAndPullRequests: async ({ q }) => ({
          data: q.includes("is:merged")
            ? { total_count: 1 + prior.length, items: [{ number: 50 }] }
            : { total_count: 1, items: [{ number: 99, html_url: "https://example.test/99", labels: [] }] },
        }),
      },
      activity: { listReposStarredByUser: () => {} },
      repos: {
        getContent: async ({ repo, path }) => {
          assert.equal(`${repo}/${path}`, ".github/messages/claim-badge.md");
          if (claimTemplate === null) throw Object.assign(new Error("Not Found"), { status: 404 });
          return { data: { content: Buffer.from(claimTemplate).toString("base64") } };
        },
      },
    },
  };
  const context = { repo: { owner: "flisk-sh", repo: "flisk" }, payload: { pull_request: pr } };
  const core = { info: () => {}, warning: () => {} };
  await new AsyncFunction("github", "context", "core", workflowScript())(github, context, core);
  return posted;
}

describe("contributor merged comments", () => {
  it("posts the full note on the fixed issue, not a short one", async () => {
    const posted = await run({ issueLabels: ["rank: 7 kyu"] });
    const issue = posted[7];
    assert.match(issue, /## ✅ Fixed by #50\. Thank you @newcomer! 💜/);
    assert.match(issue, /This is your first merged PR here/);
    assert.match(issue, /Merged into `main` as 0fd0fb1/);
    assert.match(issue, /🥋 You cleared a \*\*7 kyu\*\* issue\. That sets your starting rank: \*\*7 kyu\*\*/);
    assert.match(issue, /### 🏅 Your Hall of Fame badge/);
    assert.match(issue, /### 🎁 Your Founding Contributor badge in 3 steps/);
    assert.match(issue, /2\. ✅ Get a PR merged\. Done! Now 📣 \[post it on X\]\(https:\/\/x\.com\/intent\/post\?text=My%20PR%20to%20flisk[^)]*%2Fpull%2F50\)/);
    assert.match(issue, /First 100 only\. 100 left\./);
    assert.match(issue, /### 🎯 Ready for another one\?\n\n- #99/);
    assert.match(issue, /Was anything unclear/);
  });

  it("fills the claim steps from the template in flisk-sh/.github", async () => {
    const template = "<!-- notes for editors -->\n### {{badgeName}}\n\n[star]({{repoUrl}}) [follow]({{orgUrl}}) {{seatsLine}} {{unknown}}";
    const issue = (await run({ issueLabels: ["rank: 7 kyu"], claimTemplate: template }))[7];
    assert.match(issue, /### Founding Contributor\n\n\[star\]\(https:\/\/github\.com\/flisk-sh\/flisk\) \[follow\]\(https:\/\/github\.com\/flisk-sh\) First 100 only\. 100 left\. {{unknown}}/);
    assert.doesNotMatch(issue, /notes for editors/);
    assert.doesNotMatch(issue, /Done!/);
  });

  it("keeps the PR note as it was", async () => {
    const pr = (await run({ issueLabels: ["rank: 7 kyu"] }))[50];
    assert.match(pr, /^<!-- flisk:contributor-merged -->\n## 🎉 Merged! Thank you @newcomer\n\nThis is your first merged PR here/);
    assert.match(pr, /This fixes #7\./);
    assert.match(pr, /🥋 You cleared a \*\*7 kyu\*\* issue/);
  });

  it("counts an issue with no rank label as 8 kyu", async () => {
    const posted = await run({ issueLabels: ["good first issue"] });
    for (const body of [posted[50], posted[7]]) {
      assert.match(body, /🥋 You cleared an \*\*8 kyu\*\* issue\. That sets your starting rank: \*\*8 kyu\*\*/);
      assert.match(body, /Next up: \[open 7 kyu issues\]/);
    }
  });

  it("counts an earlier unranked issue as 8 kyu, so a 7 kyu fix is a rank up", async () => {
    const posted = await run({ issueLabels: ["rank: 7 kyu"], priorIssueLabels: ["documentation"] });
    assert.match(posted[7], /\*\*Rank up!\*\* Your highest rank goes from 8 kyu to \*\*7 kyu\*\*/);
  });
});
