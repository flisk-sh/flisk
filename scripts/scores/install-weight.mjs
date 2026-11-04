// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Install weight of the npm package: the packed size of the tarball CI builds (`--tarball`), with the unpacked size, file
// count, runtime dependencies and the heaviest folders in the summary. A ratchet with 10% tolerance, so ordinary growth
// passes and a stray folder or bundle does not. The tarball is read directly (gzip + tar headers), without npm.
import { readFileSync, statSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { round1 } from "./lib.mjs";

export const meta = {
	id: "install-weight",
	title: "npm package packed size",
	source: "artifact",
	mode: "ratchet",
	better: "lower",
	unit: "KB",
	tolerance: 0.1,
};

const field = (buf, start, length) => buf.subarray(start, start + length).toString("utf8").replace(/\0.*$/s, "");

// Regular files in a tar archive: { name, size, data }.
export function tarEntries(tar) {
	const entries = [];
	let offset = 0;
	while (offset + 512 <= tar.length) {
		const header = tar.subarray(offset, offset + 512);
		if (header.every((b) => b === 0)) break;
		const name = field(header, 0, 100);
		const prefix = field(header, 345, 155);
		const size = Number.parseInt(field(header, 124, 12).trim() || "0", 8);
		const type = String.fromCharCode(header[156] || 48);
		const start = offset + 512;
		if (type === "0") {
			entries.push({ name: prefix ? `${prefix}/${name}` : name, size, data: tar.subarray(start, start + size) });
		}
		offset = start + Math.ceil(size / 512) * 512;
	}
	return entries;
}

// The folders (two levels under package/) that hold the most unpacked bytes.
export function heaviestFolders(entries, limit = 8) {
	const sizes = new Map();
	for (const { name, size } of entries) {
		const parts = name.replace(/^package\//, "").split("/");
		const key = parts.length > 2 ? `${parts[0]}/${parts[1]}/` : parts.length === 2 ? `${parts[0]}/` : parts[0];
		sizes.set(key, (sizes.get(key) ?? 0) + size);
	}
	return [...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

const kb = (bytes) => round1(bytes / 1024);

export function measure({ tarball }) {
	if (!tarball) return { value: null };
	const packed = statSync(tarball).size;
	const entries = tarEntries(gunzipSync(readFileSync(tarball)));
	const unpacked = entries.reduce((n, e) => n + e.size, 0);
	const manifest = entries.find((e) => e.name === "package/package.json");
	const deps = manifest ? Object.keys(JSON.parse(manifest.data.toString("utf8")).dependencies ?? {}).length : 0;
	return {
		value: kb(packed),
		summary: `${kb(unpacked)} KB unpacked, ${entries.length} files, ${deps} runtime dependencies`,
		findings: heaviestFolders(entries).map(([folder, bytes]) => `${folder} ${kb(bytes)} KB unpacked`),
	};
}
