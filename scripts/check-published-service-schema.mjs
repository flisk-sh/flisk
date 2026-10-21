// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// Offline check of engine/schemas/service-schema.json. It never fetches the live Pages copy:
// that file is a deploy artifact published from main (see .github/workflows/publish-service-schema.yml),
// so a PR that changes the schema could never match it before merge.
import { readFile } from "node:fs/promises";

const sourcePath = new URL("../engine/schemas/service-schema.json", import.meta.url);
const schema = JSON.parse(await readFile(sourcePath, "utf8"));

const problems = [];
if (schema.type !== "object") problems.push('root "type" must be "object"');
if (typeof schema.$schema !== "string") problems.push('missing "$schema"');
if (!schema.properties || typeof schema.properties !== "object") problems.push('missing "properties"');
// Provider ids come from the CLI registries; a closed enum here would make every new provider a schema PR.
for (const field of ["framework", "language"]) {
  const prop = schema.properties?.[field];
  if (!prop) problems.push(`properties.${field} is missing`);
  else if (prop.enum) problems.push(`properties.${field} must stay an open string, not an enum`);
  else if (prop.type !== "string" || typeof prop.pattern !== "string" || new RegExp(prop.pattern).test("Bad_Id"))
    problems.push(`properties.${field} needs type "string" and an id pattern`);
}

if (problems.length) {
  console.error(`Invalid engine/schemas/service-schema.json:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("engine/schemas/service-schema.json is valid and keeps provider ids open.");
