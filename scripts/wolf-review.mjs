// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
//
// Wolf PR review: asks flisk-wolf (inference.flisk.si) to check every
// service.json a pull request changes, and writes one comment body.
// Wolf is a small model tuned for service.json, so this reviews only those
// files and only says something when its corrected JSON differs from the file.
//
// Env: FLISK_INFERENCE_KEY (required, else exits 0 writing nothing),
// FLISK_INFERENCE_URL, BASE_SHA, HEAD_SHA, OUT_FILE.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

export const MARKER = "<!-- flisk-wolf-review -->";
export const MAX_FILES = 5;
export const MAX_CHARS = 6000;

const SERVICE_JSON = /(^|\/)service\.json$/;

export function changedServiceJson(paths) {
  return paths.filter((p) => SERVICE_JSON.test(p)).slice(0, MAX_FILES);
}

export function buildPrompt(path, content, diff) {
  return [
    `This Flisk service.json (${path}) was changed in a pull request.`,
    `The change:\n${diff.slice(0, MAX_CHARS)}`,
    `The file now:\n${content.slice(0, MAX_CHARS)}`,
    "If it is valid, reply with the file unchanged. If not, fix it with the smallest change, keeping every other field. Reply with the JSON object only.",
  ].join("\n\n");
}

export function stripFences(text) {
  return String(text ?? "")
    .split("\n")
    .filter((l) => !l.startsWith("```"))
    .join("\n")
    .trim();
}

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  }
  return v;
}

// Same JSON compares equal whatever the spacing or key order.
function canonical(text) {
  try {
    return JSON.stringify(sortKeys(JSON.parse(text)));
  } catch {
    return null;
  }
}

// Returns { path, status: "ok" | "suggest" | "unusable" | "error", suggestion?, detail? }.
export async function reviewFile({ path, content, diff, url, key, fetchImpl = fetch }) {
  let res;
  try {
    res = await fetchImpl(`${url}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "flisk-wolf",
        messages: [{ role: "user", content: buildPrompt(path, content, diff) }],
      }),
    });
  } catch (e) {
    return { path, status: "error", detail: String(e.message ?? e) };
  }
  if (!res.ok) return { path, status: "error", detail: `HTTP ${res.status}` };
  const body = await res.json().catch(() => null);
  const reply = stripFences(body?.choices?.[0]?.message?.content);
  const fixed = canonical(reply);
  if (fixed === null) return { path, status: "unusable" };
  if (fixed === canonical(content)) return { path, status: "ok" };
  return { path, status: "suggest", suggestion: JSON.stringify(JSON.parse(reply), null, 2) };
}

export function renderComment(results) {
  const suggest = results.filter((r) => r.status === "suggest");
  const lines = [MARKER, "### 🐺 Wolf review of `service.json` changes", ""];
  if (suggest.length === 0) {
    lines.push("Wolf found nothing to change in the service.json files this PR touches.");
  }
  for (const r of suggest) {
    lines.push(
      `**\`${r.path}\`**: Wolf suggests this version. Check it before using it.`,
      "",
      "```json",
      r.suggestion,
      "```",
      "",
    );
  }
  const skipped = results.filter((r) => r.status === "error" || r.status === "unusable");
  if (skipped.length) {
    lines.push(`Not reviewed: ${skipped.map((r) => `\`${r.path}\``).join(", ")} (Wolf gave no usable answer).`, "");
  }
  lines.push(
    "_[Wolf](https://inference.flisk.si) is a small beta model for service.json, not a general code reviewer. It never blocks a merge._",
  );
  return lines.join("\n");
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

async function main(env = process.env) {
  const key = env.FLISK_INFERENCE_KEY;
  if (!key) {
    console.log("FLISK_INFERENCE_KEY is not set (fork PR or no key): skipping.");
    return;
  }
  const url = env.FLISK_INFERENCE_URL || "https://inference.flisk.si/v1";
  const base = env.BASE_SHA;
  const head = env.HEAD_SHA || "HEAD";
  const files = changedServiceJson(git(["diff", "--name-only", "--diff-filter=AM", `${base}...${head}`]).split("\n").filter(Boolean));
  if (files.length === 0) {
    console.log("No service.json changed: nothing to review.");
    return;
  }
  const results = [];
  for (const path of files) {
    const content = readFileSync(path, "utf8");
    const diff = git(["diff", `${base}...${head}`, "--", path]);
    results.push(await reviewFile({ path, content, diff, url, key }));
  }
  writeFileSync(env.OUT_FILE || "wolf-review.md", renderComment(results));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
