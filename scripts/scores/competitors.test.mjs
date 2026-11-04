// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { line, measure, measureRepo, REPOS, SELF, wordsBeforeFirstCommand } from "./competitors.mjs";

const NOW = new Date("2026-10-27T12:00:00Z");
const b64 = (s) => Buffer.from(s).toString("base64");

// A fake GitHub API: each repo's metadata, README and latest release; a missing entry answers like a 404.
const fakeGh = (repos) => (args) => {
	const [, route] = args;
	const [, owner, name, what, extra] = route.split("/");
	const repo = repos[`${owner}/${name}`];
	if (!repo) throw new Error("gh: Not Found (HTTP 404)");
	if (!what) return { stargazers_count: repo.stars, pushed_at: "2026-10-26T12:00:00Z" };
	if (what === "readme" && repo.readme) return { content: b64(repo.readme) };
	if (what === "releases" && extra === "latest" && repo.released) return { published_at: repo.released };
	throw new Error("gh: Not Found (HTTP 404)");
};

test("Flisk is in the list", () => {
	assert.ok(REPOS.includes(SELF));
	assert.equal(new Set(REPOS).size, REPOS.length);
});

test("words before the first command count only the prose above the first code block", () => {
	assert.equal(wordsBeforeFirstCommand("# Tool\n\nOne two three.\n\n```bash\nrun it\n```\nafter"), 4);
	assert.equal(wordsBeforeFirstCommand("No code at all here"), 5);
});

test("measureRepo reads stars, ages and the README; a missing README or release is null", () => {
	const gh = fakeGh({ "a/one": { stars: 1200, readme: "Easy words.\n```\nx\n```", released: "2026-10-17T12:00:00Z" }, "b/two": { stars: 5 } });
	const one = measureRepo(gh, "a/one", NOW);
	assert.equal(one.stars, 1200);
	assert.equal(one.pushedDays, 1);
	assert.equal(one.releaseDays, 10);
	assert.equal(one.wordsBeforeCommand, 2);
	assert.equal(typeof one.ease, "number");
	assert.match(line(one), /^a\/one: ★ 1\.2k, README ease [\d.]+, 2 words before the first command, 0% infrastructure words, pushed 1 d ago, released 10 d ago$/);
	const two = measureRepo(gh, "b/two", NOW);
	assert.deepEqual([two.ease, two.releaseDays, two.wordsBeforeCommand], [null, null, null]);
	assert.deepEqual(measureRepo(gh, "c/gone", NOW), { repo: "c/gone", error: "gh: Not Found (HTTP 404)" });
});

test("measure ranks Flisk's README by reading ease among the tools measured", () => {
	const repos = Object.fromEntries(
		REPOS.map((r, i) => [r, { stars: 1000 * (i + 1), readme: "Declarative orchestration necessitates comprehensive configuration." }]),
	);
	repos[SELF] = { stars: 10, readme: "Your agent builds the application. Flisk runs everything locally on your computer." };
	repos[REPOS[1]] = { stars: 9, readme: "Go. Run. See." };
	delete repos[REPOS[2]];
	const r = measure({ gh: fakeGh(repos), now: NOW });
	assert.equal(r.value, 2);
	assert.equal(r.max, REPOS.length - 1);
	assert.match(r.summary, new RegExp(`^Flisk's README is #2 of ${REPOS.length - 1} by reading ease \\([\\d.]+\\); #${REPOS.length - 2} by stars$`));
	assert.equal(r.findings.at(-1), `${REPOS[2]}: not measured (gh: Not Found (HTTP 404))`);
});
