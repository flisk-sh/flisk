#!/usr/bin/env node
// Verify that an npm package was built from the expected commit.
// Usage: node scripts/verify-npm-source.mjs --package @flisk-sh/flisk --version 1.4.31 --commit abc123def456
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const REGISTRY = "https://registry.npmjs.org";

/** The registry URL of one published version: scoped names keep "@" and encode the "/". */
export const versionUrl = (pkg, version, registry = REGISTRY) =>
	`${registry}/${pkg.replace("/", "%2f")}/${encodeURIComponent(version)}`;

/**
 * Find the tarball URL of pkg@version, retrying while the registry catches up with a publish.
 * It reads the registry over plain HTTPS, not `npm view`: in the release job setup-node writes an .npmrc that reads
 * ${NODE_AUTH_TOKEN}, which only the publish step sets, so every `npm view` after it failed on config and 1.4.62 and
 * 1.4.63 were reported "not visible" although they were live.
 * Returns { tarballUrl } or { error } with the last reason seen.
 */
export const findTarball = async (
	pkg,
	version,
	{
		fetchImpl = fetch,
		sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
		attempts = 12,
		delayMs = 10_000,
	} = {},
) => {
	let error = "no attempt made";
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const res = await fetchImpl(versionUrl(pkg, version), {
				headers: { accept: "application/json" },
			});
			if (res.ok) {
				const tarballUrl = (await res.json())?.dist?.tarball;
				if (tarballUrl) return { tarballUrl };
				error = "registry answer has no dist.tarball";
			} else {
				error = `registry answered HTTP ${res.status}`;
			}
		} catch (e) {
			error = `registry request failed: ${e?.message ?? e}`;
		}
		if (attempt < attempts) await sleep(delayMs);
	}
	return { error };
};

const main = async () => {
	const args = process.argv.slice(2);
	const flag = (name) => {
		const i = args.indexOf(name);
		return i === -1 ? undefined : args[i + 1];
	};

	const pkg = flag("--package") || process.env.NPM_PACKAGE || "@flisk-sh/flisk";
	const version = flag("--version") || process.env.NPM_VERSION;
	const expectedCommit = flag("--commit") || process.env.EXPECTED_COMMIT;

	if (!version || !expectedCommit) {
		console.error(
			"usage: verify-npm-source.mjs --package <pkg> --version <ver> --commit <sha>",
		);
		process.exit(2);
	}

	const tempDir = mkdtempSync(join(tmpdir(), "npm-verify-"));
	try {
		const { tarballUrl, error } = await findTarball(pkg, version);
		if (!tarballUrl) {
			console.error(
				`::error::${pkg}@${version} is not visible on the registry after 2 minutes (${error})`,
			);
			process.exit(1);
		}

		// Download and extract the tarball
		const tarballPath = join(tempDir, "package.tgz");
		execFileSync("curl", ["-fsSL", "--output", tarballPath, tarballUrl], {
			stdio: "inherit",
		});
		execFileSync("tar", ["-xzf", tarballPath, "-C", tempDir]);

		// Check for a .sourceSHA file (would be set by the build script)
		const sourceFile = join(tempDir, "package", ".sourceSHA");
		let sourceSHA = "";
		try {
			sourceSHA = readFileSync(sourceFile, "utf8").trim();
		} catch {
			console.warn(
				"::warning::No .sourceSHA file in package, skipping source verification for now",
			);
			console.log(
				`Published ${pkg}@${version}. Manual verification: npm pack && tar -tzf *.tgz | head`,
			);
			return;
		}

		if (sourceSHA !== expectedCommit) {
			console.error(
				`::error::npm package ${pkg}@${version} was built from commit ${sourceSHA}, expected ${expectedCommit}`,
			);
			process.exit(1);
		}
		console.log(
			`✓ Verified ${pkg}@${version} was built from commit ${expectedCommit}`,
		);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
