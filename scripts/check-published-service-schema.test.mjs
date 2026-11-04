// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for scripts/check-published-service-schema.mjs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"check-published-service-schema.mjs",
);

const REPO_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);

const MINIMAL_VALID_SCHEMA = {
	$schema: "http://json-schema.org/draft-07/schema#",
	title: "Flisk Resource Configuration",
	type: "object",
	properties: {
		framework: {
			type: "string",
			pattern: "^[a-z0-9-]+$",
			description: "Framework identifier",
		},
		language: {
			type: "string",
			pattern: "^[a-z0-9-]+$",
			description: "Language identifier",
		},
	},
};

function createWorkspace(schema) {
	const dir = mkdtempSync(path.join(tmpdir(), "flisk-schema-check-test-"));
	const scriptsDir = path.join(dir, "scripts");
	const schemasDir = path.join(dir, "runtime", "engine", "schemas");

	mkdirSync(scriptsDir, { recursive: true });
	mkdirSync(schemasDir, { recursive: true });

	const scriptTarget = path.join(
		scriptsDir,
		"check-published-service-schema.mjs",
	);
	copyFileSync(SCRIPT_PATH, scriptTarget);

	if (schema !== undefined) {
		const content =
			typeof schema === "string" ? schema : JSON.stringify(schema, null, 2);
		writeFileSync(
			path.join(schemasDir, "service-schema.json"),
			content,
			"utf8",
		);
	}

	return {
		dir,
		schemaPath: path.join(schemasDir, "service-schema.json"),
		run() {
			return spawnSync(process.execPath, [scriptTarget], {
				cwd: dir,
				encoding: "utf8",
			});
		},
		cleanup() {
			rmSync(dir, { recursive: true, force: true });
		},
	};
}

test("passes when the schema matches the published schema contract (minimal fixture)", () => {
	const workspace = createWorkspace(MINIMAL_VALID_SCHEMA);
	try {
		const result = workspace.run();
		assert.equal(
			result.status,
			0,
			`Expected exit status 0, got ${result.status}: ${result.stderr}`,
		);
		assert.match(
			result.stdout,
			/runtime\/engine\/schemas\/service-schema\.json is valid and keeps provider ids open\./,
		);
		assert.equal(result.stderr, "");
	} finally {
		workspace.cleanup();
	}
});

test("passes with the repository production service-schema.json copy", () => {
	const realSchema = JSON.parse(
		readFileSync(
			path.join(
				REPO_ROOT,
				"runtime",
				"engine",
				"schemas",
				"service-schema.json",
			),
			"utf8",
		),
	);
	const workspace = createWorkspace(realSchema);
	try {
		const result = workspace.run();
		assert.equal(
			result.status,
			0,
			`Expected exit status 0, got ${result.status}: ${result.stderr}`,
		);
		assert.match(result.stdout, /is valid and keeps provider ids open\./);
		assert.equal(result.stderr, "");
	} finally {
		workspace.cleanup();
	}
});

test("fails with clear diagnostic when root type is not an object", () => {
	const workspace = createWorkspace({
		...MINIMAL_VALID_SCHEMA,
		type: "array",
	});
	try {
		const result = workspace.run();
		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/Invalid runtime\/engine\/schemas\/service-schema\.json:/,
		);
		assert.match(result.stderr, /root "type" must be "object"/);
	} finally {
		workspace.cleanup();
	}
});

test("fails with clear diagnostic when $schema is missing or not a string", () => {
	const invalidSchema = { ...MINIMAL_VALID_SCHEMA };
	delete invalidSchema.$schema;

	const workspace = createWorkspace(invalidSchema);
	try {
		const result = workspace.run();
		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/Invalid runtime\/engine\/schemas\/service-schema\.json:/,
		);
		assert.match(result.stderr, /missing "\$schema"/);
	} finally {
		workspace.cleanup();
	}
});

test("fails with clear diagnostic when properties object is missing", () => {
	const invalidSchema = { ...MINIMAL_VALID_SCHEMA };
	delete invalidSchema.properties;

	const workspace = createWorkspace(invalidSchema);
	try {
		const result = workspace.run();
		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/Invalid runtime\/engine\/schemas\/service-schema\.json:/,
		);
		assert.match(result.stderr, /missing "properties"/);
	} finally {
		workspace.cleanup();
	}
});

test("fails with clear diagnostic when required provider fields are missing", () => {
	const missingFramework = {
		...MINIMAL_VALID_SCHEMA,
		properties: {
			language: MINIMAL_VALID_SCHEMA.properties.language,
		},
	};

	const workspaceA = createWorkspace(missingFramework);
	try {
		const result = workspaceA.run();
		assert.equal(result.status, 1);
		assert.match(result.stderr, /properties\.framework is missing/);
	} finally {
		workspaceA.cleanup();
	}

	const missingLanguage = {
		...MINIMAL_VALID_SCHEMA,
		properties: {
			framework: MINIMAL_VALID_SCHEMA.properties.framework,
		},
	};

	const workspaceB = createWorkspace(missingLanguage);
	try {
		const result = workspaceB.run();
		assert.equal(result.status, 1);
		assert.match(result.stderr, /properties\.language is missing/);
	} finally {
		workspaceB.cleanup();
	}
});

test("fails with clear diagnostic when provider ids use a closed enum instead of open string", () => {
	const enumFramework = {
		...MINIMAL_VALID_SCHEMA,
		properties: {
			...MINIMAL_VALID_SCHEMA.properties,
			framework: {
				...MINIMAL_VALID_SCHEMA.properties.framework,
				enum: ["react", "nextjs"],
			},
		},
	};

	const workspace = createWorkspace(enumFramework);
	try {
		const result = workspace.run();
		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/properties\.framework must stay an open string, not an enum/,
		);
	} finally {
		workspace.cleanup();
	}
});

test("fails with clear diagnostic when provider id pattern is missing or permits invalid ids", () => {
	const badPattern = {
		...MINIMAL_VALID_SCHEMA,
		properties: {
			...MINIMAL_VALID_SCHEMA.properties,
			language: {
				type: "string",
				pattern: "^[a-zA-Z0-9_-]+$", // matches "Bad_Id"
			},
		},
	};

	const workspace = createWorkspace(badPattern);
	try {
		const result = workspace.run();
		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/properties\.language needs type "string" and an id pattern/,
		);
	} finally {
		workspace.cleanup();
	}
});

test("fails with clear diagnostic when the schema file is missing or corrupted", () => {
	const missingWorkspace = createWorkspace(undefined);
	try {
		const result = missingWorkspace.run();
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /ENOENT/);
	} finally {
		missingWorkspace.cleanup();
	}

	const corruptWorkspace = createWorkspace("{ malformed json");
	try {
		const result = corruptWorkspace.run();
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /SyntaxError|JSON/);
	} finally {
		corruptWorkspace.cleanup();
	}
});

test("aggregates and reports multiple schema problems at once", () => {
	const multiProblemSchema = {
		type: "string", // wrong type
		// missing $schema
		properties: {
			framework: {
				enum: ["react"], // closed enum
			},
			// language is missing
		},
	};

	const workspace = createWorkspace(multiProblemSchema);
	try {
		const result = workspace.run();
		assert.equal(result.status, 1);
		assert.match(result.stderr, /root "type" must be "object"/);
		assert.match(result.stderr, /missing "\$schema"/);
		assert.match(
			result.stderr,
			/properties\.framework must stay an open string, not an enum/,
		);
		assert.match(result.stderr, /properties\.language is missing/);
	} finally {
		workspace.cleanup();
	}
});
