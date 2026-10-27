// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// AGENTS.md: "New services, examples, and fixtures must run database migrations in an explicit migrator resource
// (appType: migrator), not from an API start script or entrypoint." A migration in an API's start script runs once per
// replica and per restart, races the other replicas and hides a failed migration behind a crash loop; the migrator
// resource runs it once, and the services that need the schema depend on it. This gate reads the places that start a
// process — package.json start/dev scripts (and their pre- hooks), Dockerfile CMD/ENTRYPOINT, shell entrypoints and
// Procfiles — in examples/, tests/fixtures/ and cli/templates/, plus the start scripts the CLI scaffolds in cli/src,
// and flags a migration command anywhere but in a migrator. ALLOWED_DIRS lists folders that run a migration on purpose
// without a service.json of their own, with the reason; an entry that matches nothing is a finding.
import path from "node:path";
import { isTestFile, read, walk } from "./lib.mjs";

export const meta = {
	id: "migrator-contract",
	title: "Database migrations only in migrator resources",
	source: "files",
	mode: "gate",
	target: 0,
	better: "lower",
	unit: "violations",
};

export const ALLOWED_DIRS = [
	{
		dir: "examples/byo-jobs/",
		reason:
			"bring-your-own one-shot jobs (restart: no) whose whole job is the migration; docs/byo.md#one-shot-jobs-migrations-seeders",
	},
	// Debt, not exceptions: these wrap an upstream template whose entrypoint migrates before it serves, and predate the
	// migrator rule. Moving the migration into a BYO one-shot job the web resource depends on removes the entry.
	{
		dir: "examples/byo/cookiecutter-django/",
		reason: "debt: entrypoint.sh runs manage.py migrate before runserver; move it to a one-shot migrator job",
	},
	{
		dir: "examples/byo/full-stack-fastapi-template/",
		reason: "debt: entrypoint.sh runs the template's prestart.sh (alembic upgrade head); move it to a one-shot migrator job",
	},
];

// Migration commands of the tools the docs and examples use.
export const MIGRATION =
	/\bprisma\s+(migrate\s+(deploy|dev|reset)|db\s+push)\b|\bdrizzle-kit\s+(migrate|push)\b|\bknex\s+migrate:latest\b|\bsequelize(-cli)?\s+db:migrate\b|\btypeorm\s+migration:run\b|\bmikro-orm\s+migration:up\b|\balembic\s+upgrade\b|\bmanage\.py\s+migrate\b|\bdbmate\s+(up|migrate)\b|\batlas\s+migrate\s+apply\b|\bgoose\b[^\n]*\bup\b|\bflyway\s+migrate\b|\brails\s+db:migrate\b|\b(npm|bun|pnpm|yarn)\s+(run\s+)?(db:)?migrate\b/;

const START_SCRIPTS = new Set(["start", "dev", "serve", "prestart", "predev", "start:prod", "start:dev"]);

// The migration commands a process would run at start in one file: { line, what }.
export function startMigrations(rel, text) {
	const base = path.posix.basename(rel);
	const out = [];
	const lines = text.split("\n");
	if (base === "package.json") {
		let scripts = {};
		try {
			scripts = JSON.parse(text).scripts ?? {};
		} catch {
			return out;
		}
		for (const [name, cmd] of Object.entries(scripts)) {
			if (!START_SCRIPTS.has(name) || !MIGRATION.test(String(cmd))) continue;
			const line = lines.findIndex((l) => l.includes(`"${name}"`)) + 1;
			out.push({ line, what: `scripts.${name}: ${cmd}` });
		}
		return out;
	}
	const dockerfile = /^Dockerfile(\..+)?$|\.Dockerfile$/.test(base);
	lines.forEach((l, i) => {
		if (/^\s*#/.test(l)) return;
		if (dockerfile && !/^\s*(CMD|ENTRYPOINT)\b/i.test(l)) return;
		const m = MIGRATION.exec(l);
		if (m) out.push({ line: i + 1, what: l.trim() });
	});
	return out;
}

// A start script the CLI scaffolds: `start: "prisma migrate deploy"` in cli/src. It belongs to a migrator when the
// code just above it builds a migrator manifest.
export function scaffoldMigrations(text) {
	const lines = text.split("\n");
	const out = [];
	lines.forEach((l, i) => {
		const m = /\b(start|dev|prestart|predev|serve)\s*:\s*["'`]([^"'`]+)["'`]/.exec(l);
		if (!m || !MIGRATION.test(m[2])) return;
		const above = lines.slice(Math.max(0, i - 30), i).join("\n");
		if (!/["']migrator["']|\bmigrator\w*\b/.test(above)) out.push({ line: i + 1, what: `${m[1]}: ${m[2]}` });
	});
	return out;
}

const isStartFile = (rel) =>
	/(^|\/)(package\.json|Procfile|Dockerfile(\.[^/]+)?|[^/]+\.Dockerfile)$/.test(rel) || /(^|\/)[^/]*entrypoint[^/]*\.sh$/.test(rel);

function appTypeOf(root, dir) {
	try {
		return JSON.parse(read(root, `${dir}/service.json`) || "{}").appType;
	} catch {
		return undefined;
	}
}

export function measure({ root }, allowedDirs = ALLOWED_DIRS) {
	const findings = [];
	const used = new Set();
	const files = [...walk(root, "examples", isStartFile), ...walk(root, "tests/fixtures", isStartFile), ...walk(root, "cli/templates", isStartFile)];
	for (const rel of files) {
		const hits = startMigrations(rel, read(root, rel));
		if (!hits.length) continue;
		const dir = path.posix.dirname(rel);
		if (appTypeOf(root, dir) === "migrator") continue;
		const allowed = allowedDirs.find((a) => rel.startsWith(a.dir));
		if (allowed) {
			used.add(allowed);
			continue;
		}
		for (const { line, what } of hits) findings.push(`${rel}:${line} ${what}: migration outside a migrator resource`);
	}
	const sources = walk(root, "cli/src", (rel) => /\.ts$/.test(rel) && !isTestFile(rel) && !rel.includes("__tests__/"));
	for (const rel of sources) {
		for (const { line, what } of scaffoldMigrations(read(root, rel)))
			findings.push(`${rel}:${line} ${what}: scaffolded start script runs a migration outside a migrator`);
	}
	for (const a of allowedDirs) if (!used.has(a)) findings.push(`${a.dir}: ALLOWED_DIRS entry no longer matches anything; remove it`);
	return {
		value: findings.length,
		summary: `${files.length} start files and ${sources.length} CLI sources read, ${findings.length} migrations outside a migrator`,
		findings,
	};
}
