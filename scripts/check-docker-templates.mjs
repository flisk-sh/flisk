#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Both copies ship to users; compare their bytes and reject CR in a script's shebang.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIRECTORIES = [
	"runtime/shared-platform-engineering/docker-templates",
	"cli/shared-platform-engineering/docker-templates",
];
const ROOT = fileURLToPath(new URL("..", import.meta.url));

function readTemplates(root, directory, problems) {
	const files = new Map();
	function visit(relative) {
		const location = path.join(directory, relative);
		try {
			for (const entry of readdirSync(path.join(root, location), { withFileTypes: true })) {
				const name = path.join(relative, entry.name);
				if (entry.isDirectory()) visit(name);
				else if (entry.isFile()) files.set(name, readFileSync(path.join(root, directory, name)));
				else problems.push(`${path.join(directory, name)}: expected a regular file or directory`);
			}
		} catch (error) {
			problems.push(`${location}: cannot read templates (${error.code ?? error.message})`);
		}
	}
	visit("");
	return files;
}

export function checkDockerTemplates(root = ROOT) {
	const problems = [];
	const copies = DIRECTORIES.map((directory) => readTemplates(root, directory, problems));
	for (const [index, files] of copies.entries()) {
		for (const [name, data] of files) {
			const newline = data.indexOf(0x0a);
			const firstLine = data.subarray(0, newline === -1 ? data.length : newline);
			if (firstLine[0] === 0x23 && firstLine[1] === 0x21 && firstLine.includes(0x0d)) {
				problems.push(`${path.join(DIRECTORIES[index], name)}: carriage return in shebang; use LF line endings`);
			}
		}
	}
	const names = new Set(copies.flatMap((files) => [...files.keys()]));
	for (const name of [...names].sort()) {
		for (const [index, files] of copies.entries()) {
			if (!files.has(name)) problems.push(`${path.join(DIRECTORIES[index], name)}: missing template`);
		}
		if (copies.every((files) => files.has(name)) && !copies[0].get(name).equals(copies[1].get(name))) {
			problems.push(`${name}: contents differ between ${DIRECTORIES.join(" and ")}`);
		}
	}
	return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const problems = checkDockerTemplates();
	for (const problem of problems) console.error(`check-docker-templates: ${problem}`);
	if (problems.length) process.exitCode = 1;
	else console.log("check-docker-templates: both copies match and shebangs use LF");
}
