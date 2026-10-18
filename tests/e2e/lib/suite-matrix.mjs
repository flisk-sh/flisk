// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Prints the GitHub Actions matrix for one or more e2e groups: the suites in tests/e2e/<group>/*/suite.json whose triggers
// include the given trigger (#1290, tracker #1279). The group workflow reads it with fromJSON(needs.plan.outputs.matrix).
//   node tests/e2e/lib/suite-matrix.mjs <group[,group...]> <trigger> [<comma-separated languages>] [<comma-separated HTTP frameworks>] [<comma-separated frontend frameworks>] [<tests/e2e dir>]
// Each leg names its `group` (the job's prefix in the UI), its `dir` (the suite folder, <group>/<suite>, that run.sh lives in) and
// its `label` (the job's name within the group). The ORM suites (group "orm") get one leg each, named for the ORM (#1493).
// The backend suite of the resource-types group is the language axis: it expands to one leg per language in the "languages"
// group (LANGUAGE is set for it) and, for bun, one more leg per HTTP framework other than the default (FRAMEWORK is set for it),
// so each leg varies one axis. The frontend suite gets one leg per frontend framework. Other suites get one leg.
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
    .flatMap((suite) => legsOf(group, suite, languages, frameworks, frontends));
}

// The language group: the language axis's legs, separate from the resource-type group they run the backend suite of (#1493).
export const LANGUAGE_GROUP = "languages";

// The default HTTP framework (the registry's DEFAULT_BACKEND_FRAMEWORK); the bun language leg already covers it.
export const DEFAULT_FRAMEWORK = "hono";

// One leg for a suite. The backend suite gets one leg per language, then one more bun leg per non-default framework.
// The frontend suite gets one leg per frontend framework, with FRAMEWORK set to it.
function legsOf(group, suite, languages, frameworks, frontends) {
  const { timeoutMinutes } = suite;
  const dir = `${group}/${suite.suite}`;
  const leg = (fields) => ({ group, dir, suite: suite.suite, language: "", framework: "", timeoutMinutes, ...fields });
  // The bring-your-own suite gets one leg per variant (suite.json "variants"), with BYO_VARIANT set to its id (#1297).
  if (Array.isArray(suite.variants)) {
    return suite.variants.map((variant) => leg({ variant: variant.id, label: `bring-your-own-${variant.id}` }));
  }
  if (suite.suite === "frontend" && frontends.length > 0) {
    return frontends.map((framework) => leg({ framework, label: `frontend-${framework}` }));
  }
  if (suite.suite === "backend" && languages.length > 0) {
    // The language axis runs in its own group, so its legs read as languages and not as resource types (#1493).
    const languageLeg = (fields) => leg({ group: LANGUAGE_GROUP, ...fields });
    const byLanguage = languages.map((language) => languageLeg({ language, label: language }));
    const byFramework = frameworks
      .filter((framework) => framework !== DEFAULT_FRAMEWORK)
      .map((framework) => languageLeg({ language: "bun", framework, label: `bun-${framework}` }));
    return [...byLanguage, ...byFramework];
  }
  // An ORM suite's label is its ORM name (prisma, drizzle), so its job reads "orm / prisma".
  return [leg({ label: suite.suite })];
}

function main(argv) {
  const [groupList, trigger, languageList, frameworkList, frontendList, dir] = argv;
  if (!groupList || !trigger) {
    console.error("usage: node tests/e2e/lib/suite-matrix.mjs <group[,group...]> <trigger> [<languages>] [<frameworks>] [<frontends>] [<tests/e2e dir>]");
    return 2;
  }
  const groups = groupList.split(",").filter(Boolean);
  const languages = languageList ? languageList.split(",").filter(Boolean) : [];
  const frameworks = frameworkList ? frameworkList.split(",").filter(Boolean) : [];
  const frontends = frontendList ? frontendList.split(",").filter(Boolean) : [];
  const e2eDir = path.resolve(dir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const include = groups.flatMap((group) => selectSuites(e2eDir, group, trigger, languages, frameworks, frontends));
  console.log(JSON.stringify({ include }));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
