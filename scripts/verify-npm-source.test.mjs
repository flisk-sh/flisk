// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Unit tests for verify-npm-source: the registry lookup, with fetch and sleep injected.
import assert from "node:assert/strict";
import test from "node:test";
import { findTarball, versionUrl } from "./verify-npm-source.mjs";

const json = (body, status = 200) => ({
	ok: status < 400,
	status,
	json: async () => body,
});
const noSleep = async () => {};

test("a scoped name keeps @ and encodes the slash", () => {
	assert.equal(
		versionUrl("@flisk-sh/flisk", "1.4.63"),
		"https://registry.npmjs.org/@flisk-sh%2fflisk/1.4.63",
	);
});

test("returns the tarball once the registry has the version", async () => {
	let calls = 0;
	const fetchImpl = async (url) => {
		calls++;
		assert.equal(url, "https://registry.npmjs.org/@flisk-sh%2fflisk/1.4.63");
		return calls < 3
			? json({}, 404)
			: json({ dist: { tarball: "https://t/x.tgz" } });
	};
	assert.deepEqual(
		await findTarball("@flisk-sh/flisk", "1.4.63", {
			fetchImpl,
			sleep: noSleep,
		}),
		{
			tarballUrl: "https://t/x.tgz",
		},
	);
	assert.equal(calls, 3);
});

test("gives up after the attempts and reports the last reason", async () => {
	let calls = 0;
	const fetchImpl = async () => {
		calls++;
		return json({}, 404);
	};
	const out = await findTarball("@flisk-sh/flisk", "9.9.9", {
		fetchImpl,
		sleep: noSleep,
		attempts: 4,
	});
	assert.equal(calls, 4);
	assert.deepEqual(out, { error: "registry answered HTTP 404" });
});

test("a network error is retried and named", async () => {
	const fetchImpl = async () => {
		throw new Error("ECONNRESET");
	};
	const out = await findTarball("p", "1.0.0", {
		fetchImpl,
		sleep: noSleep,
		attempts: 2,
	});
	assert.deepEqual(out, { error: "registry request failed: ECONNRESET" });
});

test("does not depend on npm config (no npm process, no NODE_AUTH_TOKEN)", async () => {
	const saved = process.env.NODE_AUTH_TOKEN;
	delete process.env.NODE_AUTH_TOKEN;
	try {
		const out = await findTarball("p", "1.0.0", {
			fetchImpl: async () => json({ dist: { tarball: "u" } }),
			sleep: noSleep,
		});
		assert.deepEqual(out, { tarballUrl: "u" });
	} finally {
		if (saved !== undefined) process.env.NODE_AUTH_TOKEN = saved;
	}
});
