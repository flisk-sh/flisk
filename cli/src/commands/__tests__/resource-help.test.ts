// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearDiscoveryCache } from "../../utils/discovery-context.js";
import { resourceCommand } from "../resource.js";

function resourceHelp(): string {
  let help = "";
  resourceCommand.configureOutput({ writeOut: (text) => (help += text) });
  resourceCommand.outputHelp();
  return help;
}

it("shows examples in resource help", () => {
  const help = resourceHelp();
  expect(help).toContain("Examples:");
  expect(help).toContain("flisk resource api --language python");
  expect(help).toContain("flisk resource jobs --type worker");
});

describe("--stack default", () => {
  let tempDir = "";
  const originalCwd = process.cwd();

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "flisk-resource-stack-default-"));
    mkdirSync(join(tempDir, ".flisk"), { recursive: true });
    writeFileSync(
      join(tempDir, ".flisk", "project.json"),
      JSON.stringify({
        version: "1.0.0",
        project: { name: "test", version: "1.0.0" },
        phases: Object.fromEntries(
          ["pre_alpha", "alpha", "beta", "out_of_scope"].map((name) => [
            name,
            { name, description: "", enabledStacks: [] },
          ]),
        ),
        optional_infra: {
          monitoring: false,
          elk: false,
          golden_image: false,
          verdaccio: false,
        },
        discovery: { paths: ["services/**"] },
      }),
    );
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    clearDiscoveryCache();
  });

  it("prints the stack a new project's first resource actually lands in", () => {
    // The option description wraps at the help width, so compare on normalized whitespace.
    const help = resourceHelp().replace(/\s+/g, " ");
    const printedDefault = help.match(
      /Stack to assign resource to \(default: "([^"]+)" for a new project\)/,
    );
    expect(printedDefault?.[1], "resource --help must print the real --stack default").toBe("main");
    expect(help).not.toContain('(default: "default")');
  });

  it("assigns a resource to that same stack when --stack is omitted", async () => {
    await resourceCommand.parseAsync(["node", "flisk", "fresh", "--type", "backend", "--yes"], {
      from: "node",
    });

    const service = JSON.parse(
      readFileSync(join(tempDir, "services", "main", "fresh", "service.json"), "utf-8"),
    );
    expect(service.stack).toBe("main");
  });
});
