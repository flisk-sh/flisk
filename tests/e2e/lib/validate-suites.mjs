// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// Validates every live-stack suite under tests/e2e/<group>/<suite>/: its suite.json has the documented shape, its folder
// matches its group and name, its run.sh is executable and defines every case suite.json lists. Workflows read suite.json, so
// a typo here would otherwise skip a suite silently.
//   node tests/e2e/lib/validate-suites.mjs [<tests/e2e dir>]
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GROUPS = ["resource-types", "journeys", "examples", "platforms", "scale"];
export const TRIGGERS = ["pr", "nightly", "release", "manual", "weekly"];
const KEYS = ["group", "suite", "description", "paths", "cases", "variants", "triggers", "timeoutMinutes", "needsSecrets"];
const CASE_ID = /^[A-Za-z][A-Za-z0-9_]*$/;

const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);

// Problems with one parsed suite.json, given the group and suite its folder says it is.
export function checkSuiteJson(suite, group, name) {
  const problems = [];
  if (typeof suite !== "object" || suite === null || Array.isArray(suite)) return ["suite.json is not a JSON object"];
  for (const key of Object.keys(suite)) if (!KEYS.includes(key)) problems.push(`unknown key "${key}"`);
  if (suite.group !== group) problems.push(`group is "${suite.group}", but the suite lives under ${group}/`);
  if (suite.suite !== name) problems.push(`suite is "${suite.suite}", but its folder is ${name}/`);
  if (typeof suite.description !== "string" || suite.description.length === 0) problems.push("description must be a non-empty string");
  if (!isStringArray(suite.paths) || suite.paths.length === 0) problems.push("paths must be a non-empty array of path globs");
  if (!isStringArray(suite.cases) || suite.cases.length === 0) {
    problems.push("cases must be a non-empty array of case ids");
  } else {
    const bad = suite.cases.filter((id) => !CASE_ID.test(id));
    if (bad.length > 0) problems.push(`case ids must be shell function names: ${bad.join(", ")}`);
    const dupes = suite.cases.filter((id, i) => suite.cases.indexOf(id) !== i);
    if (dupes.length > 0) problems.push(`duplicate cases: ${dupes.join(", ")}`);
  }
  if (!isStringArray(suite.triggers) || suite.triggers.length === 0) {
    problems.push(`triggers must be a non-empty array of: ${TRIGGERS.join(", ")}`);
  } else {
    const bad = suite.triggers.filter((t) => !TRIGGERS.includes(t));
    if (bad.length > 0) problems.push(`unknown triggers: ${bad.join(", ")} (allowed: ${TRIGGERS.join(", ")})`);
  }
  if (!Number.isInteger(suite.timeoutMinutes) || suite.timeoutMinutes < 1 || suite.timeoutMinutes > 360) {
    problems.push("timeoutMinutes must be an integer from 1 to 360");
  }
  // A suite with variants gets one matrix leg per entry; each entry names its id, its example and the case that checks it (#1297).
  if (suite.variants !== undefined) {
    if (!Array.isArray(suite.variants) || suite.variants.length === 0) {
      problems.push("variants must be a non-empty array when present");
    } else {
      for (const v of suite.variants) {
        if (!v || typeof v.id !== "string" || typeof v.name !== "string" || typeof v.case !== "string") problems.push("each variant needs string id, name and case");
        else if (!suite.cases.includes(v.case)) problems.push(`variant ${v.id} names case ${v.case}, which is not in cases`);
      }
    }
  }
  if (!Array.isArray(suite.needsSecrets) || !suite.needsSecrets.every((s) => /^[A-Z][A-Z0-9_]*$/.test(s))) {
    problems.push("needsSecrets must be an array of secret names (empty when none)");
  }
  const triggers = Array.isArray(suite.triggers) ? suite.triggers : [];
  // A pull request from a fork has no secrets, and scale suites are too slow for one.
  if (Array.isArray(suite.needsSecrets) && suite.needsSecrets.length > 0 && triggers.includes("pr")) {
    problems.push("a suite that needs secrets must not run on pr");
  }
  if (group === "scale" && triggers.includes("pr")) problems.push("scale suites must not run on pr");
  return problems;
}

// Every problem under <e2eDir>, as "<group>/<suite>: <problem>" strings. selfCheck runs `run.sh self-check`.
export function validateSuites(e2eDir, { selfCheck = true } = {}) {
  const problems = [];
  for (const group of GROUPS) {
    const groupDir = path.join(e2eDir, group);
    if (!existsSync(groupDir)) continue;
    for (const name of readdirSync(groupDir)) {
      const dir = path.join(groupDir, name);
      if (!statSync(dir).isDirectory()) continue;
      const where = `${group}/${name}`;
      const jsonFile = path.join(dir, "suite.json");
      const runFile = path.join(dir, "run.sh");
      if (!existsSync(jsonFile)) {
        problems.push(`${where}: missing suite.json`);
        continue;
      }
      let suite;
      try {
        suite = JSON.parse(readFileSync(jsonFile, "utf8"));
      } catch (error) {
        problems.push(`${where}: suite.json is not valid JSON (${error.message})`);
        continue;
      }
      for (const problem of checkSuiteJson(suite, group, name)) problems.push(`${where}: ${problem}`);
      if (!existsSync(runFile)) {
        problems.push(`${where}: missing run.sh`);
        continue;
      }
      try {
        accessSync(runFile, constants.X_OK);
      } catch {
        problems.push(`${where}: run.sh is not executable`);
      }
      if (selfCheck) {
        const result = spawnSync("bash", [runFile, "self-check"], { encoding: "utf8" });
        if (result.status !== 0) problems.push(`${where}: run.sh self-check failed: ${(result.stderr || result.stdout).trim()}`);
      }
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const e2eDir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const problems = validateSuites(e2eDir);
  if (problems.length > 0) {
    console.error(`${problems.length} suite problem(s):\n${problems.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
  }
  const count = GROUPS.flatMap((g) => (existsSync(path.join(e2eDir, g)) ? readdirSync(path.join(e2eDir, g)) : [])).length;
  console.log(`checked ${count} suite(s) under ${path.relative(process.cwd(), e2eDir) || "."}: all valid`);
}
