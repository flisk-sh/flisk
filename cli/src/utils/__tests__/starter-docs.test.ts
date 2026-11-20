// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { starterCatalog } from "../create-catalog.js";
import { listProjectTemplates } from "../project-templates.js";

const repoRoot = resolve(__dirname, "../../../..");
const startersDoc = readFileSync(resolve(repoRoot, "docs/starters.md"), "utf-8").replace(
  /\r\n/g,
  "\n",
);
const readme = readFileSync(resolve(repoRoot, "README.md"), "utf-8");

const TABLE_START = "<!-- starter-table:start -->";
const TABLE_END = "<!-- starter-table:end -->";

/** The canonical table in docs/starters.md, one line per starter. */
function docRows(): string[] {
  const start = startersDoc.indexOf(TABLE_START);
  const end = startersDoc.indexOf(TABLE_END);
  expect(start, `${TABLE_START} is missing from docs/starters.md`).toBeGreaterThan(-1);
  expect(end, `${TABLE_END} is missing from docs/starters.md`).toBeGreaterThan(start);
  return startersDoc
    .slice(start + TABLE_START.length, end)
    .trim()
    .split("\n");
}

/** The Docker column comes from the same catalog the CLI uses for `flisk create --starter`. */
function dockerCell(key: string): string {
  const starter = starterCatalog().find((option) => option.id === key);
  expect(starter, `starter "${key}" is missing from the create catalog`).toBeDefined();
  return starter?.local ? "No" : "Yes";
}

function expectedRow(key: string, description: string): string {
  return `| \`${key}\` | ${description} | ${dockerCell(key)} | \`flisk project ${key}\` |`;
}

describe("starter documentation", () => {
  it("documents every starter key from flisk project --list", () => {
    const rows = docRows();
    expect(rows[0]).toBe("| Key | What it builds | Needs Docker? | Example command |");
    expect(rows[1]).toBe("| --- | --- | --- | --- |");
    const templates = listProjectTemplates();
    for (const { key, description } of templates) {
      expect(
        rows.some((row) => row === expectedRow(key, description)),
        `Starter "${key}" from flisk project --list has no docs entry in docs/starters.md`,
      ).toBe(true);
    }
    expect(rows.length, "the starters table has a row that is not in the registry").toBe(
      templates.length + 2,
    );
  });

  it.each(["launch", "portal", "fullstack"])("shows an example command for %s", (key) => {
    expect(docRows().join("\n")).toContain(`\`flisk project ${key}\``);
  });

  it("links the starters table from the README", () => {
    expect(readme).toContain("](docs/starters.md#all-starters)");
  });
});
