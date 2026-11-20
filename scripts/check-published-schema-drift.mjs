// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Fetches the published copy of the service schema and compares its top-level property names with the source of truth.
// Only names are compared: the publish job copies the whole file, so a missing or extra name proves a stale deploy.
// The comparison is exported so scripts/check-published-schema-drift.test.mjs can exercise it without a network.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLISHED_SCHEMA_URL = "https://flisk.sh/schema.service.json";
const SOURCE_PATH = new URL("../runtime/engine/schemas/service-schema.json", import.meta.url);
const TIMEOUT_MS = 20_000;

export function propertyNamesOf(schema, label) {
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
		throw new Error(`${label} is not a JSON object`);
	}
	if (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
		throw new Error(`${label}.properties is not an object`);
	}
	return Object.keys(schema.properties);
}

export function compareSchemaProperties(source, published) {
	const sourceNames = new Set(propertyNamesOf(source, "source schema"));
	const publishedNames = new Set(propertyNamesOf(published, "published schema"));
	const missing = [...sourceNames].filter((name) => !publishedNames.has(name)).sort();
	const extra = [...publishedNames].filter((name) => !sourceNames.has(name)).sort();
	return {
		missing,
		extra,
		inSync: missing.length === 0 && extra.length === 0,
		sourceCount: sourceNames.size,
		publishedCount: publishedNames.size,
	};
}

export async function checkPublishedSchema({
	sourcePath = SOURCE_PATH,
	url = PUBLISHED_SCHEMA_URL,
	fetchSchema = fetch,
} = {}) {
	const source = JSON.parse(await readFile(sourcePath, "utf8"));
	let published;
	try {
		const response = await fetchSchema(url, {
			signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: { "user-agent": "flisk-schema-drift-check/1.0" },
		});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
		}
		published = await response.json();
	} catch (error) {
		throw new Error(`Could not read ${url}: ${error.message}`);
	}
	return compareSchemaProperties(source, published);
}

export async function main(argv = []) {
	const args = { url: process.env.PUBLISHED_SCHEMA_URL || PUBLISHED_SCHEMA_URL };
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === "--url") {
			args.url = argv[++i];
			if (!args.url) throw new Error("--url needs a URL");
		} else {
			throw new Error(`unknown argument: ${argv[i]}`);
		}
	}

	try {
		const result = await checkPublishedSchema({ url: args.url });
		if (result.inSync) {
			console.log(`${args.url} matches all ${result.sourceCount} source properties.`);
			return 0;
		}
		console.error(
			`Published schema ${args.url} has drifted from runtime/engine/schemas/service-schema.json.\n` +
				`  in source, not published (${result.missing.length}): ${result.missing.join(", ") || "none"}\n` +
				`  in published, not source (${result.extra.length}): ${result.extra.join(", ") || "none"}\n` +
				"Set PAGES_SYNC_TOKEN and re-run the publish-service-schema workflow to refresh the published copy.",
		);
		return 1;
	} catch (error) {
		console.error(`Could not compare ${args.url} with the source schema: ${error.message}`);
		return 1;
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	process.exitCode = await main(process.argv.slice(2));
}
