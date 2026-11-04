// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for the brand-consistency scorer, on a fixture repository and a fake gh that serves the website's files.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { brandChecks, hero, htmlText, installCommand, leadCommand, measure, nameSpellings, websiteFile, yamlValue } from "./brand-consistency.mjs";

function fixture(files) {
	const root = mkdtempSync(path.join(tmpdir(), "brand-consistency-"));
	for (const [rel, body] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		writeFileSync(path.join(root, rel), body);
	}
	return root;
}

// A gh that answers `api repos/flisk-sh/website/contents/<path>` from a map, base64 like the API, and fails otherwise.
const fakeGh = (files) => (args) => {
	const m = /^repos\/flisk-sh\/website\/contents\/(.+)$/.exec(args[1] ?? "");
	if (args[0] !== "api" || !m || !(m[1] in files)) throw new Error("HTTP 404");
	return { encoding: "base64", content: Buffer.from(files[m[1]]).toString("base64") };
};

const README = [
	"# Flisk: your whole app, running on your computer with one command",
	"",
	"```bash",
	"npm install -g @flisk-sh/flisk",
	"mkdir my-shop && cd my-shop",
	"flisk project --yes",
	"flisk up shop",
	"```",
].join("\n");
const pkg = JSON.stringify({ name: "@flisk-sh/flisk", description: "Flisk: your whole app, running on your computer with one command." });
const LLMS = "# Flisk\n\n> Flisk: your whole app, running on your computer with one command.\n\n```bash\nnpm install -g @flisk-sh/flisk\nflisk project --yes\nflisk up\n```\n";
const index = (h1, lead) =>
	`---\nlayout: default\ntitle: Flisk: your whole app, running on your computer with one command\n---\n<section><h1>${h1}</h1>\n<p>Run <code>${lead}</code>, then <code>flisk up</code>.</p>\n<div class="aw-install"><code>{{ site.data.flisk.install_npm }}</code></div></section>`;
const SAME = {
	"index.html": index("Your whole app, running on your computer with one command", "flisk project"),
	"_config.yml": "title: Flisk CLI\ntagline: Your whole app, running on your computer with one command\n",
	"_data/flisk.yml": 'install_npm: "npm install -g @flisk-sh/flisk"\n',
	"llms.txt": LLMS,
};

function run(website) {
	const root = fixture({ "README.md": README, "package.json": pkg, "docs/agents/llms.txt": LLMS });
	try {
		return measure({ root, gh: fakeGh(website) });
	} finally {
		rmSync(root, { recursive: true });
	}
}

test("one headline, lead command, install command and spelling everywhere is no drift", () => {
	const r = run(SAME);
	assert.equal(r.value, 0);
	assert.equal(r.max, 4);
	assert.equal(r.summary, "one brand on every surface");
	assert.deepEqual(r.findings, []);
});

test("a website that leads with flisk import, another headline and a curl install drifts three ways, every surface listed", () => {
	const r = run({
		...SAME,
		"index.html": index("Your <code>docker-compose.yml</code>, running locally", "flisk import ."),
		"llms.txt": "# Flisk\n\n```bash\ncurl -fsSL https://flisk.sh/install.sh | sh\nflisk doctor\n```\n",
	});
	assert.equal(r.value, 3);
	assert.equal(r.summary, "drift in headline, lead command, install command");
	assert.ok(r.findings.includes("headline: flisk.sh hero <h1>: Your docker-compose.yml , running locally"));
	assert.ok(r.findings.includes("lead command: README.md quickstart: flisk project"));
	assert.ok(r.findings.includes("lead command: flisk.sh hero: flisk import"));
	assert.ok(r.findings.includes("install command: flisk.sh llms.txt: curl -fsSL https://flisk.sh/install.sh | sh"));
});

test("FLISK in prose is a spelling drift; the command, URLs, code and longer words are not", () => {
	assert.deepEqual(nameSpellings("FLISK runs it; FLisk too. flisk up, `FLISK x`, https://FLISK.sh, docs/FLISK.md, FliskOS, flisk-sh, @flisk-sh/flisk. FLISK."), [
		{ spelling: "FLISK", count: 2 },
		{ spelling: "FLisk", count: 1 },
	]);
	const r = run({ ...SAME, "llms.txt": `${LLMS}\nFLISK is great.\n` });
	assert.equal(r.value, 1);
	assert.deepEqual(r.findings, ["name spelling: flisk.sh llms.txt: FLISK 1×"]);
});

test("a website repository that cannot be read is no data, not a pass", () => {
	assert.equal(run({}).value, null);
	assert.equal(websiteFile(fakeGh({}), "index.html"), "");
});

test("the helpers read front matter, the hero, commands and installs", () => {
	assert.equal(yamlValue('title: "Flisk CLI"\ntagline: x # note\n', "title"), "Flisk CLI");
	assert.equal(yamlValue("tagline: x # note\n", "tagline"), "x");
	assert.equal(htmlText("Run <code>flisk up</code> {{ site.x }} &amp; more"), "Run flisk up & more");
	assert.equal(hero("<nav>flisk doctor</nav><h1>Hi</h1><p>flisk import</p><div class=\"aw-install\">flisk x</div>"), "<h1>Hi</h1><p>flisk import</p><div class=\"");
	assert.equal(leadCommand("npm install -g @flisk-sh/flisk\nsee flisk.sh\nflisk project --yes"), "flisk project");
	assert.equal(leadCommand("no command here"), null);
	assert.equal(installCommand("x\npnpm  add -g @flisk-sh/flisk\n"), "pnpm add -g @flisk-sh/flisk");
	assert.equal(installCommand("curl -fsSL https://claude.ai/install.sh | bash"), null);
});

test("brandChecks reports each surface's value for every check", () => {
	const checks = brandChecks({ readme: README, packageJson: pkg, llms: LLMS, website: { index: "", config: "", data: "", llms: "" } });
	assert.deepEqual(
		checks.map((c) => [c.check, c.drift]),
		[
			["headline", false],
			["lead command", false],
			["install command", false],
			["name spelling", false],
		],
	);
	assert.equal(checks[1].surfaces[0].value, "flisk project");
});
