// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Prints the GitHub Actions matrix for one e2e group: the suites in tests/e2e/<group>/*/suite.json whose triggers include the
// given trigger (#1290, tracker #1279). The group workflow reads it with fromJSON(needs.plan.outputs.matrix).
//   node tests/e2e/lib/suite-matrix.mjs <group> <trigger> [<comma-separated languages>] [<comma-separated HTTP frameworks>] [<tests/e2e dir>]
// The frontend suite is given the frontend frameworks through the same list, once per value (see frontendLegs).
// The backend suite expands to one leg per language (LANGUAGE is set for it) and, for bun, one more leg per HTTP framework
// other than the default (FRAMEWORK is set for it), so each leg varies one axis. Other suites get one leg.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The suites of one group that run for a trigger, as a matrix `include` list. Sorted by name so the matrix is stable.
export function selectSuites(e2eDir, group, trigger, languages = [], frameworks = [], frontends = []) {
  const groupDir = path.join(e2eDir, group);
  if (!existsSync(groupDir)) return [];
  return readdirSync(groupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(groupDir, entry.name, "suite.json"))
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, "utf8")))
    .filter((suite) => Array.isArray(suite.triggers) && suite.triggers.includes(trigger))
    .sort((a, b) => a.suite.localeCompare(b.suite))
    .flatMap((suite) => legsOf(suite, languages, frameworks, frontends));
}

// The default HTTP framework (the registry's DEFAULT_BACKEND_FRAMEWORK); the bun language leg already covers it.
export const DEFAULT_FRAMEWORK = "hono";

// One leg for a suite. The backend suite gets one leg per language, then one more bun leg per non-default framework.
// The frontend suite gets one leg per frontend framework, with FRAMEWORK set to it.
function legsOf(suite, languages, frameworks, frontends) {
  const { timeoutMinutes } = suite;
  if (suite.suite === "frontend" && frontends.length > 0) {
    return frontends.map((framework) => ({ suite: suite.suite, language: "", framework, label: `frontend-${framework}`, timeoutMinutes }));
  }
  if (suite.suite === "backend" && languages.length > 0) {
    const byLanguage = languages.map((language) => ({ suite: suite.suite, language, framework: "", label: `backend-${language}`, timeoutMinutes }));
    const byFramework = frameworks
      .filter((framework) => framework !== DEFAULT_FRAMEWORK)
      .map((framework) => ({ suite: suite.suite, language: "bun", framework, label: `backend-bun-${framework}`, timeoutMinutes }));
    return [...byLanguage, ...byFramework];
  }
  return [{ suite: suite.suite, language: "", framework: "", label: suite.suite, timeoutMinutes }];
}

function main(argv) {
  const [group, trigger, languageList, frameworkList, frontendList, dir] = argv;
  if (!group || !trigger) {
    console.error("usage: node tests/e2e/lib/suite-matrix.mjs <group> <trigger> [<languages>] [<frameworks>] [<tests/e2e dir>]");
    return 2;
  }
  const languages = languageList ? languageList.split(",").filter(Boolean) : [];
  const frameworks = frameworkList ? frameworkList.split(",").filter(Boolean) : [];
  const frontends = frontendList ? frontendList.split(",").filter(Boolean) : [];
  const e2eDir = path.resolve(dir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  console.log(JSON.stringify({ include: selectSuites(e2eDir, group, trigger, languages, frameworks, frontends) }));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
