// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkNames, collectCheckNames, DOCTOR_SOURCE } from "./doctor-checks/extract.mjs";
import { measure, undocumented } from "./doctor-check-docs.mjs";
import { withFixture } from "./testing/fixture.mjs";

test("checkNames takes CheckResult names once each, not other name: fields", () => {
	const src = `return {\n    name: "Docker Versions",\n    didPass: true,\n};\nreturn { name: "Tilt CLI",\n  name: "Docker Versions",\nconst x = { name: "lowercase" };\n`;
	assert.deepEqual(checkNames(src), ["Docker Versions", "Tilt CLI"]);
});

test("DOCTOR_SOURCE matches doctor sources only", () => {
	for (const rel of ["cli/src/commands/doctor.ts", "cli/src/utils/doctor-wiring.ts", "cli/src/utils/windows-doctor.ts", "cli/src/utils/public-env-secrets.ts"])
		assert.equal(DOCTOR_SOURCE.test(rel), true, rel);
	for (const rel of ["cli/src/commands/up.ts", "cli/src/utils/paths.ts", "cli/src/commands/__tests__/doctor.test.ts"])
		assert.equal(DOCTOR_SOURCE.test(rel), false, rel);
});

test("undocumented compares names without regard to case", () => {
	assert.deepEqual(undocumented(["Docker Versions", "Tilt CLI"], "## docker versions\n"), ["Tilt CLI"]);
});

test("collectCheckNames merges, dedupes and sorts across files, skipping tests", () =>
	withFixture(
		{
			"cli/src/commands/doctor.ts": '  name: "Tilt CLI",\n  name: "Docker Versions",\n',
			"cli/src/utils/doctor-wiring.ts": '  name: "Docker Versions",\n',
			"cli/src/commands/__tests__/doctor.test.ts": '  name: "Ignored Check",\n',
		},
		(root) => assert.deepEqual(collectCheckNames(root), ["Docker Versions", "Tilt CLI"]),
	));

test("measure reports the documented share and names each missing check", () =>
	withFixture(
		{ "cli/src/commands/doctor.ts": '  name: "Docker Versions",\n  name: "Tilt CLI",\n', "docs/troubleshooting.md": "## docker versions\n" },
		(root) => {
			const r = measure({ root });
			assert.equal(r.value, 50);
			assert.deepEqual(r.findings, ['docs/troubleshooting.md: no entry for the "Tilt CLI" check']);
		},
	));

test("measure throws without the page and reports no data without checks", () =>
	withFixture({}, (root) => assert.throws(() => measure({ root }), /troubleshooting\.md is missing/))
		.then(() => withFixture({ "docs/troubleshooting.md": "x" }, (root) => assert.equal(measure({ root }).value, null))));
