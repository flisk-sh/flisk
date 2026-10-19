import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PLACEHOLDERS = [
	/^\[input\]$/i,
	/^\[(?:todo|tbd|insert|add)\]$/i,
	/^(?:todo|tbd|n\/a)(?:\b|:)/i,
	/^your (?:summary|description) here$/i,
	/^(?:describe|explain|summarize) (?:the|your|what) (?:change|changes|work|summary|tests?)(?: here)?\.?$/i,
];

function withoutComments(text) {
	const lines = text.split(/\r?\n/);
	const visible = [];
	let inComment = false;
	for (const line of lines) {
		let index = 0;
		let output = "";
		while (index < line.length) {
			if (inComment) {
				const close = line.indexOf("-->", index);
				if (close < 0) break;
				inComment = false;
				index = close + 3;
				continue;
			}
			const open = line.indexOf("<!--", index);
			if (open < 0) {
				output += line.slice(index);
				break;
			}
			output += line.slice(index, open);
			inComment = true;
			index = open + 4;
		}
		if (output.trim()) visible.push(output);
	}
	return visible.join("\n").trim();
}

function section(body, heading) {
	const lines = body.split(/\r?\n/);
	const start = lines.findIndex((line) => line.trim().toLowerCase() === heading.toLowerCase());
	if (start < 0) return "";
	const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
	return withoutComments(lines.slice(start + 1, end < 0 ? lines.length : end).join("\n"));
}

function nonPlaceholderLines(text) {
	return text
		.split(/\r?\n/)
		.map((line) => line.replace(/^\s*(?:[-*+]\s+)?(?:\[[ xX]\]\s*)?/, "").trim())
		.filter((line) => line && !PLACEHOLDERS.some((pattern) => pattern.test(line)));
}

export function reviewReadiness(body) {
	const summary = section(body, "## What changed?");
	const verification = section(body, "## How did you check it?");
	const issues = [];

	if (nonPlaceholderLines(summary).length === 0) {
		issues.push("Add a real change summary under **What changed?**; remove placeholders such as [Input] or TODO.");
	}

	const completedChecks = verification.split(/\r?\n/).some((line) => {
		const match = line.match(/^\s*[-*+]\s+\[x\]\s+(.+)$/i);
		if (!match) return false;
		const item = match[1].trim();
		if (/^i said which checks? i did not run/i.test(item)) return false;
		const otherCheck = item.match(/^other check:\s*(.*)$/i);
		return nonPlaceholderLines(otherCheck ? otherCheck[1] : item).length > 0;
	});
	const documentedCustomCheck = verification.split(/\r?\n/).some((line) => {
		const match = line.match(/^\s*[-*+]\s+Other check:\s*(.+)$/i);
		return Boolean(match && nonPlaceholderLines(match[1]).length > 0);
	});
	if (!completedChecks && !documentedCustomCheck) {
		issues.push("Mark a completed verification item or fill in **Other check** with the command and result.");
	}

	return { passed: issues.length === 0, issues };
}

// A merge queue entry's head ref names its pull request: refs/heads/gh-readonly-queue/main/pr-<number>-<sha>.
export function pullRequestFromMergeGroup(headRef) {
	const match = /\/pr-(\d+)-/.exec(headRef ?? "");
	return match ? Number(match[1]) : null;
}

// The pull request body for this event. A merge queue run has no pull request in its payload, so it reads the PR named by the
// queue ref. Fails closed: if the PR cannot be read, the check fails instead of passing.
export function bodyForEvent(event, repo, token) {
	if (event.pull_request) return event.pull_request.body ?? "";
	if (event.merge_group) {
		const number = pullRequestFromMergeGroup(event.merge_group.head_ref);
		if (number === null) throw new Error("the merge queue ref does not name a pull request");
		return execFileSync("gh", ["api", `repos/${repo}/pulls/${number}`, "--jq", ".body // \"\""], {
			encoding: "utf8",
			env: { ...process.env, GH_TOKEN: token },
		});
	}
	throw new Error(`unsupported event: ${Object.keys(event).join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
	const result = reviewReadiness(bodyForEvent(event, process.env.GITHUB_REPOSITORY, process.env.GH_TOKEN));
	const lines = result.passed
		? [
				"## PR summary review: passed",
				"",
				"A change summary and completed verification notes are present. Human code review is still required.",
			]
		: [
				"## PR summary review: changes needed",
				"",
				...result.issues.map((issue) => `- ${issue}`),
				"",
				"This automated check validates PR completeness; it does not approve code. A human approval is still required.",
			];
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
	if (!result.passed) {
		for (const issue of result.issues) console.error(`::error::${issue}`);
		process.exit(1);
	}
	console.log("PR summary and verification notes are present.");
}
