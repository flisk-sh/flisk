// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Prints the GitHub Actions matrix for one e2e group: the suites in tests/e2e/<group>/*/suite.json whose triggers include the
// given trigger (#1290, tracker #1279). The group workflow reads it with fromJSON(needs.plan.outputs.matrix).
//   node tests/e2e/lib/suite-matrix.mjs <group> <trigger> [<comma-separated languages>] [<tests/e2e dir>]
// The backend suite expands to one leg per language (LANGUAGE is set for it); other suites get one leg.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The suites of one group that run for a trigger, as a matrix `include` list. Sorted by name so the matrix is stable.
export function selectSuites(e2eDir, group, trigger, languages = []) {
  const groupDir = path.join(e2eDir, group);
  if (!existsSync(groupDir)) return [];
  return readdirSync(groupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(groupDir, entry.name, "suite.json"))
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, "utf8")))
    .filter((suite) => Array.isArray(suite.triggers) && suite.triggers.includes(trigger))
    .sort((a, b) => a.suite.localeCompare(b.suite))
    .flatMap((suite) => legsOf(suite, languages));
}

// One leg for a suite; the backend suite gets one leg per language.
function legsOf(suite, languages) {
  const { timeoutMinutes } = suite;
  if (suite.suite === "backend" && languages.length > 0) {
    return languages.map((language) => ({ suite: suite.suite, language, label: `backend-${language}`, timeoutMinutes }));
  }
  return [{ suite: suite.suite, language: "", label: suite.suite, timeoutMinutes }];
}

function main(argv) {
  const [group, trigger, languageList, dir] = argv;
  if (!group || !trigger) {
    console.error("usage: node tests/e2e/lib/suite-matrix.mjs <group> <trigger> [<comma-separated languages>] [<tests/e2e dir>]");
    return 2;
  }
  const languages = languageList ? languageList.split(",").filter(Boolean) : [];
  const e2eDir = path.resolve(dir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  console.log(JSON.stringify({ include: selectSuites(e2eDir, group, trigger, languages) }));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
