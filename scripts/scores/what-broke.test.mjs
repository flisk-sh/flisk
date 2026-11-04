// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { BOOT, buckets, LABEL, measure, TRIED } from "./what-broke.mjs";

const TEMPLATES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.github/ISSUE_TEMPLATE");
const form = (file) => YAML.parse(readFileSync(path.join(TEMPLATES, file), "utf8"));
const byLabel = (f, label) => f.body.find((field) => field.attributes?.label === label);

// The spec-buttons bot appends this to every new issue, after the last field.
const BUTTONS = "\n\n<!-- ai-spec-buttons -->\n\n---\n\n**Write a spec in**\n[![Grok](https://example.invalid/grok.svg)](https://grok.com/)";

const boot = (number, broke) => ({
	number,
	title: `boot: report ${number}`,
	createdAt: "2026-10-27T09:00:00Z",
	body: `### OS\n\nUbuntu 24.04\n\n### flisk --version\n\n1.4.7\n\n### Minutes until first healthy URL\n\n8\n\n### What broke\n\n${broke}\n\n### Commands you ran\n\n\`\`\`shell\nflisk up\n\`\`\`${BUTTONS}`,
});

const tried = (number, result, saw) => ({
	number,
	title: `tried: report ${number}`,
	createdAt: "2026-10-27T09:00:00Z",
	body: `### What did you try?\n\nexamples/one-backend-python\n\n### How did it go?\n\n${result}\n\n### Overall, how easy or difficult was this task?\n\n_No response_\n\n### What did you see?\n\n${saw}\n\n### Pasted output (optional)\n\n_No response_\n\n### Your setup (optional)\n\n_No response_${BUTTONS}`,
});

const ctxWith = (issues) => ({ repo: "flisk-sh/flisk", now: new Date("2026-10-28T12:00:00Z"), gh: () => issues });

test("buckets matches whole words, plurals included, and can hit several buckets", () => {
	assert.deepEqual(buckets("postgres: Bind for 0.0.0.0:5432 failed: port is already allocated by Docker"), ["docker", "port", "database"]);
	assert.deepEqual(buckets("two containers exited"), ["docker"]);
	assert.deepEqual(buckets("Tiltfile error under WSL2"), ["tilt", "windows/wsl"]);
	assert.deepEqual(buckets("npm ERR! EACCES: permission denied"), ["node/npm", "permissions"]);
	assert.deepEqual(buckets("request timed out behind the corporate proxy"), ["network/proxy"]);
	assert.deepEqual(buckets("ENOSPC: no space left on device"), ["memory/disk"]);
});

test("buckets does not match a keyword inside another word, and falls back to other", () => {
	// "report" and "important" contain "port"; "bundle" contains "bun".
	assert.deepEqual(buckets("an important report about the bundle"), ["other"]);
	assert.deepEqual(buckets(""), ["other"]);
	assert.deepEqual(buckets(undefined), ["other"]);
});

test("measure counts boot reports that name a breakage and tried reports that failed or were odd", () => {
	const r = measure(
		ctxWith([
			boot(1, "Docker Desktop was not running, then port 8080 was taken"),
			boot(2, "Nothing."),
			boot(3, "none"),
			boot(4, "N/A"),
			boot(5, "_No response_"),
			boot(6, "flisk up hung on the postgres migration"),
			tried(7, "It failed", "EADDRINUSE on 3000"),
			tried(8, "It worked, but something was slow or odd", "first build pulled images for ten minutes"),
			tried(9, "It worked", "all green, docker was fine"),
			tried(10, "I did not finish", "ran out of time"),
			{ number: 11, title: "Docs typo", createdAt: "2026-10-27T09:00:00Z", body: "### Page\n\nREADME" },
		]),
	);
	assert.equal(r.value, 4);
	assert.equal(r.summary, "4 of 10 reports: port 2, docker 1, database 1, other 1");
	assert.deepEqual(r.findings, ["#1 docker, port", "#6 database", "#7 port", "#8 other"]);
});

test("measure gives 0 when reports exist and nothing broke, and no value without reports", () => {
	assert.equal(measure(ctxWith([boot(1, "nothing"), tried(2, "It worked", "fine")])).value, 0);
	assert.equal(measure(ctxWith([])).value, null);
});

test("the boot and tried forms still have the fields and answers the scorer reads", () => {
	const bootForm = form("i-booted-flisk.yml");
	assert.ok(bootForm.labels.includes(LABEL));
	assert.match(bootForm.title, BOOT.title);
	assert.equal(byLabel(bootForm, BOOT.field)?.type, "textarea");

	const triedForm = form("try-it-and-report.yml");
	assert.ok(triedForm.labels.includes(LABEL));
	assert.match(triedForm.title, TRIED.title);
	const result = byLabel(triedForm, TRIED.result);
	assert.equal(result?.type, "dropdown");
	for (const answer of TRIED.broke) assert.ok(result.attributes.options.includes(answer), answer);
	assert.equal(byLabel(triedForm, TRIED.field)?.type, "textarea");
});
