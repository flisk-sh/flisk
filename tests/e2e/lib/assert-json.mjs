// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
// JSON assertions for the agent suite (tests/e2e/resource-types/agent/run.sh). Exits 1 with a message that names what was expected.
//   envelope <file> [code]        file holds exactly one line: one parseable machine envelope; with [code], a failure with that code
//   check <file> <expr> <message> evaluate <expr> with `j` bound to the parsed file; it must be truthy
//   equal <fileA> <fileB>         both parse to deeply equal JSON
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const [command, ...args] = process.argv.slice(2);
const fail = (message) => {
  console.error(`ASSERT FAILED: ${message}`);
  process.exit(1);
};
const read = (file) => readFileSync(file, "utf8");
const parse = (file, text = read(file)) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    return fail(`${file} is not valid JSON (${error.message}): ${text.slice(0, 300)}`);
  }
};

if (command === "envelope") {
  const [file, code] = args;
  const text = read(file);
  // Exactly one envelope on stdout and nothing else: one line, one JSON object, no stack trace.
  const lines = text.split("\n").filter((line) => line.length > 0);
  if (lines.length !== 1) fail(`stdout must be exactly one line, got ${lines.length}:\n${text}`);
  const envelope = parse(file, lines[0]);
  if (typeof envelope.schemaVersion !== "number") fail(`envelope has no numeric schemaVersion: ${lines[0]}`);
  if (!Array.isArray(envelope.errors)) fail(`envelope.errors is not an array: ${lines[0]}`);
  if (/\bat .*\(.*:\d+:\d+\)/.test(text)) fail(`stdout contains a stack trace:\n${text}`);
  if (code) {
    if (envelope.errors.length !== 1) fail(`expected exactly one error, got: ${lines[0]}`);
    if (envelope.errors[0].code !== code) fail(`expected error code ${code}, got ${envelope.errors[0].code}: ${lines[0]}`);
    if (envelope.data !== null) fail(`a failure envelope must have data: null, got: ${lines[0]}`);
  }
} else if (command === "check") {
  const [file, expr, message] = args;
  const j = parse(file);
  let ok;
  try {
    ok = new Function("j", `return (${expr});`)(j);
  } catch (error) {
    fail(`${message} (expression threw: ${error.message})`);
  }
  if (!ok) fail(`${message}\n  expression: ${expr}\n  actual: ${read(file).slice(0, 600)}`);
} else if (command === "equal") {
  const [a, b] = args;
  if (!isDeepStrictEqual(parse(a), parse(b))) {
    fail(`${a} and ${b} differ:\n--- ${a}\n${read(a).slice(0, 800)}\n--- ${b}\n${read(b).slice(0, 800)}`);
  }
} else {
  console.error("usage: assert-json.mjs envelope|check|equal ...");
  process.exit(2);
}
