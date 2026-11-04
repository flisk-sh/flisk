// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/hacktoberfest-embed.mjs. Run by `make test-shell`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_REPO,
  MAP_PATH,
  bannerMarkup,
  embedIssues,
  embedMarkup,
  listUrl,
  main,
  mapUrl,
  shouldEmbed,
} from "./hacktoberfest-embed.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("./hacktoberfest-embed.mjs", import.meta.url));

test("bannerMarkup produces the expected markdown embed for a given repository", () => {
  const defaultMarkup = bannerMarkup();
  const explicitMarkup = bannerMarkup("flisk-sh/flisk");
  assert.equal(defaultMarkup, explicitMarkup);

  const expectedSvgUrl = "https://raw.githubusercontent.com/flisk-sh/flisk/journey-map/docs/journey/hacktoberfest.svg";
  const expectedListUrl = "https://github.com/flisk-sh/flisk/issues?q=is%3Aissue+is%3Aopen+label%3Ahacktoberfest";

  assert.equal(mapUrl("flisk-sh/flisk"), expectedSvgUrl);
  assert.equal(listUrl("flisk-sh/flisk"), expectedListUrl);

  assert.ok(defaultMarkup.includes(`[![Flisk Hacktoberfest map](${expectedSvgUrl})](${expectedListUrl})`));
  assert.ok(defaultMarkup.includes("Part of Hacktoberfest. Filled dot = merged, hollow dot = open. Click the map for all open `hacktoberfest` issues."));

  const customRepo = "my-org/my-repo";
  const customMarkup = bannerMarkup(customRepo);
  assert.ok(customMarkup.includes(`https://raw.githubusercontent.com/${customRepo}/journey-map/docs/journey/hacktoberfest.svg`));
  assert.ok(customMarkup.includes(`https://github.com/${customRepo}/issues?q=is%3Aissue+is%3Aopen+label%3Ahacktoberfest`));
});

test("shouldEmbed accurately detects whether hacktoberfest map is already present", () => {
  assert.equal(shouldEmbed(""), true);
  assert.equal(shouldEmbed(null), true);
  assert.equal(shouldEmbed(undefined), true);
  assert.equal(shouldEmbed("This is an issue description without map."), true);
  assert.equal(shouldEmbed(`Already contains ${MAP_PATH} in the body.`), false);
  assert.equal(shouldEmbed("https://raw.githubusercontent.com/flisk-sh/flisk/journey-map/docs/journey/hacktoberfest.svg"), false);
});

test("embedMarkup embeds banner at the top of issue body for fixed input", () => {
  const fixedInput = "## Problem Description\n\nNeed unit test coverage for hacktoberfest embed script.";
  const embedded = embedMarkup(fixedInput, "flisk-sh/flisk");

  const expected = bannerMarkup("flisk-sh/flisk") + fixedInput;
  assert.equal(embedded, expected);

  // Idempotent: embedding again returns the existing body unchanged
  assert.equal(embedMarkup(embedded, "flisk-sh/flisk"), embedded);

  // When body is empty, returns banner markup
  assert.equal(embedMarkup("", "flisk-sh/flisk"), bannerMarkup("flisk-sh/flisk"));
  assert.equal(embedMarkup(null, "flisk-sh/flisk"), bannerMarkup("flisk-sh/flisk"));
});

test("embedIssues updates issues missing the map and skips issues that already have it", () => {
  const calls = [];
  const logs = [];

  const fakeRunner = (args, input) => {
    calls.push({ args, input });
    if (args[0] === "issue" && args[1] === "list") {
      return JSON.stringify([
        {
          number: 101,
          body: "Already has map: https://raw.githubusercontent.com/flisk-sh/flisk/journey-map/docs/journey/hacktoberfest.svg",
        },
        {
          number: 102,
          body: "Plain issue without map.",
        },
        {
          number: 103,
          body: null,
        },
      ]);
    }
    if (args[0] === "issue" && args[1] === "edit") {
      return "";
    }
    throw new Error(`Unexpected runner call: ${args.join(" ")}`);
  };

  const result = embedIssues({
    repo: "flisk-sh/flisk",
    runner: fakeRunner,
    log: (msg) => logs.push(msg),
  });

  assert.deepEqual(result, { added: 2, skipped: 1, total: 3 });

  // List call was made
  assert.equal(calls[0].args[0], "issue");
  assert.equal(calls[0].args[1], "list");

  // Edit call for #102
  assert.equal(calls[1].args[0], "issue");
  assert.equal(calls[1].args[1], "edit");
  assert.equal(calls[1].args[2], "102");
  assert.equal(calls[1].input, bannerMarkup("flisk-sh/flisk") + "Plain issue without map.");

  // Edit call for #103
  assert.equal(calls[2].args[0], "issue");
  assert.equal(calls[2].args[1], "edit");
  assert.equal(calls[2].args[2], "103");
  assert.equal(calls[2].input, bannerMarkup("flisk-sh/flisk"));

  assert.equal(calls.length, 3);
  assert.ok(logs.includes("added map to #102"));
  assert.ok(logs.includes("added map to #103"));
  assert.ok(logs.includes("2 added, 1 already had it"));
});

test("embedIssues throws when repository is empty or missing", () => {
  assert.throws(() => embedIssues({ repo: "" }), /Repository is required/);
  assert.throws(() => embedIssues({ repo: "   " }), /Repository is required/);
  assert.throws(() => embedIssues({ repo: null }), /Repository is required/);
});

test("embedIssues throws when runner output is missing, invalid, or fails", () => {
  assert.throws(() => embedIssues({ runner: () => null }), /Missing runner output for issues list/);
  assert.throws(() => embedIssues({ runner: () => "" }), /Missing runner output for issues list/);
  assert.throws(() => embedIssues({ runner: () => "invalid-json" }), /Failed to parse issues JSON/);
  assert.throws(() => embedIssues({ runner: () => "{}" }), /Expected JSON array of issues/);
  assert.throws(() => embedIssues({ runner: () => { throw new Error("gh command failed"); } }), /gh command failed/);
  assert.throws(
    () => embedIssues({ runner: () => JSON.stringify([{ body: "missing number" }]) }),
    /Invalid issue entry: missing number/,
  );
});

test("main returns exit code 0 on success and 1 when repository is empty or runner fails", () => {
  const logs = [];
  const errors = [];
  const successRunner = (args) => {
    if (args[0] === "issue" && args[1] === "list") return "[]";
    return "";
  };

  assert.equal(main([], { runner: successRunner, log: (m) => logs.push(m), error: (e) => errors.push(e) }), 0);
  assert.equal(main(["flisk-sh/flisk"], { runner: successRunner, log: (m) => logs.push(m), error: (e) => errors.push(e) }), 0);

  // Missing or empty repository input
  assert.equal(main([""], { runner: successRunner, error: (e) => errors.push(e) }), 1);
  assert.equal(main(["   "], { runner: successRunner, error: (e) => errors.push(e) }), 1);

  // Runner failure
  assert.equal(main(["flisk-sh/flisk"], { runner: () => null, error: (e) => errors.push(e) }), 1);
  assert.equal(main(["flisk-sh/flisk"], { runner: () => "malformed", error: (e) => errors.push(e) }), 1);
  assert.equal(main(["flisk-sh/flisk"], { runner: () => { throw new Error("failure"); }, error: (e) => errors.push(e) }), 1);

  assert.ok(errors.includes("Repository must not be empty"));
  assert.ok(errors.some((e) => e.includes("Missing runner output")));
  assert.ok(errors.some((e) => e.includes("Failed to parse issues JSON")));
  assert.ok(errors.includes("failure"));
});

test("script exits non-zero via CLI when input is missing or fails", () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, ""], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Repository must not be empty/);
});
