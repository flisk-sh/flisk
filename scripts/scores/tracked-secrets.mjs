// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// AGENTS.md: "Never commit secrets or .env". This gate reads the files git tracks for the two ways that happens: an
// environment file (.env, .env.local, .env.production, ...; the .example/.sample/.template copies that document the
// variables are fine) and a credential written out in full — a private key block, or a token whose provider prefix and
// length make it unambiguous (AWS, GitHub, npm, Slack, Stripe live keys, Anthropic, OpenAI project keys, Google API
// keys), or an .npmrc auth token that is not an ${ENV} reference. A test fixture that needs a fake key builds it at
// runtime or uses an obvious placeholder; ALLOWED lists a file that must hold one, with the reason, and an entry that
// matches nothing is a finding. Gate at zero: GitHub push protection catches some of these, not all, and not on forks.
import { execFileSync } from "node:child_process";
import { read, walk } from "./lib.mjs";

export const meta = {
	id: "tracked-secrets",
	title: "No .env files or credentials in tracked files",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "findings",
};

// { file, reason } for a tracked file that must contain a credential-shaped string. None today.
export const ALLOWED = [];

export const ENV_FILE = /(^|\/)\.env(\.(?!example$|sample$|template$|dist$)[\w.-]+)?$/;

export const SECRETS = [
	["private key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/],
	["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
	["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,})\b/],
	["npm token", /\bnpm_[A-Za-z0-9]{36}\b/],
	["Slack token", /\bxox[abposr]-[0-9A-Za-z-]{10,}/],
	["Slack webhook", /hooks\.slack\.com\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{20,}/],
	["Stripe live key", /\b[sr]k_live_[0-9A-Za-z]{20,}\b/],
	["Anthropic key", /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{40,}/],
	["OpenAI key", /\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{40,}/],
	["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
];
const NPMRC_TOKEN = /_authToken\s*=\s*(?!\$\{)\S{8,}/;

// The credentials in one file's text: { line, what }.
export function scan(rel, text) {
	const out = [];
	const npmrc = /(^|\/)\.npmrc$/.test(rel);
	text.split("\n").forEach((line, i) => {
		for (const [what, re] of SECRETS) if (re.test(line)) out.push({ line: i + 1, what });
		if (npmrc && NPMRC_TOKEN.test(line)) out.push({ line: i + 1, what: "npm auth token" });
	});
	return out;
}

// The tracked files, or every file under root when it is not a git checkout (a test fixture).
export function trackedFiles(root) {
	try {
		return execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
			.split("\0")
			.filter(Boolean);
	} catch {
		return walk(root, ".");
	}
}

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|tgz|gz|zip|mp4|webm|cast|lockb|wasm)$/i;

export function measure({ root }, allowed = ALLOWED) {
	const files = trackedFiles(root);
	const findings = [];
	const used = new Set();
	for (const rel of files) {
		if (ENV_FILE.test(rel)) findings.push(`${rel}: environment file is tracked; keep it out of git and commit a .env.example`);
		if (BINARY.test(rel)) continue;
		const hits = scan(rel, read(root, rel));
		if (!hits.length) continue;
		const ok = allowed.find((a) => a.file === rel);
		if (ok) {
			used.add(ok);
			continue;
		}
		for (const { line, what } of hits) findings.push(`${rel}:${line} ${what}`);
	}
	for (const a of allowed) if (!used.has(a)) findings.push(`${a.file}: ALLOWED entry no longer matches anything; remove it`);
	return { value: findings.length, summary: `${files.length} tracked files, ${findings.length} secrets or .env files`, findings };
}
