// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { isScanned, measure } from "./public-env-secrets.mjs";
import { withFixture } from "./testing/fixture.mjs";

const judge = (value) => value.startsWith("SECRET");

test("isScanned takes files users copy from and skips generated output", () => {
	for (const rel of [".env.example", "apps/web/.env.local", "docs/a.md", "compose.yaml", "docker-compose.dev.yml", "Dockerfile", "x.star"])
		assert.equal(isScanned(rel), true, rel);
	for (const rel of ["cli/dist/a.md", "release-dist-linux/a.md", ".flisk/a.yml", "src/a.ts", "image.png"])
		assert.equal(isScanned(rel), false, rel);
});

test("measure flags secret-looking public values by file, line and name, and skips generated files", () =>
	withFixture(
		{
			"docs/a.md": "```\nVITE_KEY=SECRETabc\n```\n",
			"cli/dist/generated.md": "VITE_KEY=SECRETabc\n",
			"ok.env": "VITE_URL=http://x\n",
		},
		async (root) => {
			const r = await measure({ root }, { judge });
			assert.equal(r.value, 1);
			assert.equal(r.findings[0], "docs/a.md:2 VITE_KEY holds a secret-looking value; public variables ship in the client bundle");
			assert.equal(JSON.stringify(r).includes("SECRETabc"), false);
		},
	));

test("measure is clean on a tree with no public variables", () =>
	withFixture({ "docs/a.md": "nothing here\n" }, async (root) => {
		const r = await measure({ root }, { judge });
		assert.deepEqual([r.value, r.findings], [0, []]);
	}));

test("without an injected judge, measure loads the CLI heuristic and says how to build it", () =>
	withFixture({ "docs/a.md": "x\n" }, async (root) => {
		await assert.rejects(measure({ root }), /npm --prefix cli run build/);
	}));

test("without an injected judge, measure uses the built CLI heuristic", () =>
	withFixture(
		{
			"cli/dist/utils/public-env-secrets.js": "export const isSecretLookingValue = (v) => v === 'BAD';\n",
			"docs/a.md": "VITE_A=BAD\nVITE_B=fine\n",
		},
		async (root) => assert.equal((await measure({ root })).value, 1),
	));
