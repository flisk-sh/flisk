// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getCustomAgentIndexTemplate } from "../custom-index-template.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function golden(durability: "files" | "postgres"): string {
  return readFileSync(join(fixturesDir, `custom-agent-index-${durability}.txt`), "utf8");
}

describe("custom agent index template (golden)", () => {
  it.each(["files", "postgres"] as const)(
    "generates byte-identical %s output to the pre-refactor template",
    (durability) => {
      expect(getCustomAgentIndexTemplate("support-agent", durability)).toBe(golden(durability));
    },
  );

  it("interpolates the service name and the configured port", () => {
    const files = getCustomAgentIndexTemplate("support-agent", "files", { port: 8123 });
    expect(files).toContain("service: 'support-agent'");
    expect(files).toContain("? envPort : 8123;");
    const other = getCustomAgentIndexTemplate("billing-agent", "files");
    expect(other).toContain("service: 'billing-agent'");
    expect(other).not.toContain("support-agent");
  });

  it("keeps the two durability variants sharing one server body", () => {
    const files = getCustomAgentIndexTemplate("support-agent", "files");
    const postgres = getCustomAgentIndexTemplate("support-agent", "postgres");
    const marker = "async function runTurn(";
    const endMarker = "// Drain on SIGTERM";
    const filesBody = files.slice(files.indexOf(marker), files.indexOf(endMarker));
    const postgresBody = postgres.slice(postgres.indexOf(marker), postgres.indexOf(endMarker));
    expect(filesBody).toBe(postgresBody);
    expect(files).toContain("const DURABILITY = 'files';");
    expect(postgres).toContain("const DURABILITY = 'postgres';");
  });
});
