// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { measure, scaffoldMigrations, startMigrations } from "./migrator-contract.mjs";

test("startMigrations reads start scripts, Dockerfile CMD/ENTRYPOINT and entrypoints, not build steps or comments", () => {
	const pkg = JSON.stringify({ scripts: { start: "prisma migrate deploy && node server.js", build: "prisma generate" } }, null, 2);
	assert.equal(startMigrations("a/package.json", pkg).length, 1);
	assert.deepEqual(startMigrations("a/package.json", JSON.stringify({ scripts: { migrate: "prisma migrate deploy" } })), []);
	const dockerfile = 'RUN npx prisma migrate deploy\n# CMD alembic upgrade head\nCMD ["sh", "-c", "alembic upgrade head && uvicorn app:app"]\n';
	assert.deepEqual(
		startMigrations("a/Dockerfile", dockerfile).map((h) => h.line),
		[3],
	);
	assert.equal(startMigrations("a/entrypoint.sh", "#!/bin/sh\npython manage.py migrate --noinput\n").length, 1);
});

test("scaffoldMigrations accepts a start script under a migrator manifest and flags one without", () => {
	const migrator = 'const config = { appType: "migrator" };\npkg.scripts = { start: "prisma migrate deploy" };\n';
	assert.deepEqual(scaffoldMigrations(migrator), []);
	const api = 'const config = { appType: "backend" };\npkg.scripts = { start: "prisma migrate deploy && bun run src/index.ts" };\n';
	assert.equal(scaffoldMigrations(api).length, 1);
});

test("measure passes a migrator, flags an API, and reports a stale ALLOWED_DIRS entry", () => {
	const root = mkdtempSync(path.join(tmpdir(), "migrator-contract-"));
	try {
		const write = (rel, text) => {
			mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
			writeFileSync(path.join(root, rel), text);
		};
		write("examples/shop/migrate/service.json", JSON.stringify({ appType: "migrator" }));
		write("examples/shop/migrate/package.json", JSON.stringify({ scripts: { start: "prisma migrate deploy" } }));
		write("examples/shop/api/service.json", JSON.stringify({ appType: "backend" }));
		write("examples/shop/api/package.json", JSON.stringify({ scripts: { start: "drizzle-kit migrate && node ." } }));
		const { value, findings } = measure({ root }, [{ dir: "examples/gone/", reason: "old" }]);
		assert.equal(value, 2);
		assert.match(findings[0], /^examples\/shop\/api\/package\.json:\d+ scripts\.start/);
		assert.match(findings[1], /examples\/gone\/: ALLOWED_DIRS entry no longer matches/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
