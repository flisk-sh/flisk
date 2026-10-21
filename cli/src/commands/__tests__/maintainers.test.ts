// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runMaintainersCheck } from "../maintainers.js";

function check(table: string | null) {
  const dir = mkdtempSync(join(tmpdir(), "tdk-maintainers-"));
  try {
    const file = join(dir, "MAINTAINERS.md");
    if (table !== null) writeFileSync(file, table);
    return runMaintainersCheck(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const header = "| Name | GitHub id | Company |\n| --- | --- | --- |\n";

describe("flisk maintainers check", () => {
  it("fails with missing counts when short of the bar", () => {
    const result = check(`${header}| Ada | ada | Acme |\n`);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("not eligible");
    expect(result.output).toContain("1 maintainers (2 missing)");
    expect(result.output).toContain("1 companies (1 missing)");
  });

  it("fails when 3 people share one company", () => {
    const result = check(`${header}| A | a | Acme |\n| B | b | Acme |\n| C | c | acme |\n`);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("0 missing");
    expect(result.output).toContain("1 missing");
  });

  it("does not count placeholder companies", () => {
    const result = check(`${header}| A | a | Acme |\n| B | b | TBD |\n| C | c | flisk-sh |\n`);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("1 maintainers");
  });

  it("passes with 3 people from 2 companies, Independent counting as one", () => {
    const result = check(`${header}| A | a | Acme |\n| B | b | Acme |\n| C | c | Independent |\n`);
    expect(result).toEqual({
      exitCode: 0,
      output: "3 maintainers, 2 companies",
    });
  });

  it("counts a duplicated GitHub id once", () => {
    const result = check(`${header}| A | a | Acme |\n| A | A | Independent |\n| A | a | Acme |\n`);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("1 maintainers (2 missing)");
  });

  it("fails and names the file when it is missing", () => {
    const result = check(null);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("MAINTAINERS.md not found");
  });

  it("fails when the required columns are absent", () => {
    const result = check("| Name | Handle |\n| --- | --- |\n| A | a |\n");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Company");
  });
});
