// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * The lightweight command table must be indistinguishable from the real program for every
 * help screen, and the CLI binary must not import heavy command modules for `--help` or a
 * cheap validation error (#4212).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { afterAll, describe, expect, it } from "vitest";
import { createProgram } from "../../program.js";
import { COMMAND_SPECS } from "../command-specs.generated.js";
import { createSpecProgram } from "../command-specs.js";

const specProgram = createSpecProgram(COMMAND_SPECS, async () => {});
const realProgram = createProgram();

/** Every command and subcommand, paired by its path from the root. */
function pairs(real: Command, spec: Command, path = ""): Array<[string, Command, Command]> {
  const here = `${path} ${real.name()}`.trim();
  const out: Array<[string, Command, Command]> = [[here, real, spec]];
  expect(spec.commands.length).toBe(real.commands.length);
  for (let i = 0; i < real.commands.length; i += 1) {
    out.push(...pairs(real.commands[i] as Command, spec.commands[i] as Command, here));
  }
  return out;
}

describe("lightweight command specs", () => {
  it("registers every command, alias and option in the same order", () => {
    expect(specProgram.commands.map((c) => c.name())).toEqual(
      realProgram.commands.map((c) => c.name()),
    );
    for (const [path, real, spec] of pairs(realProgram, specProgram)) {
      expect(spec.name(), path).toBe(real.name());
      expect(spec.aliases(), path).toEqual(real.aliases());
      expect(spec.description(), path).toBe(real.description());
      expect(
        spec.options.map((o) => [o.flags, o.description, o.defaultValue]),
        path,
      ).toEqual(real.options.map((o) => [o.flags, o.description, o.defaultValue]));
      expect(
        spec.registeredArguments.map((a) => [a.name(), a.description, a.required, a.variadic]),
        path,
      ).toEqual(
        real.registeredArguments.map((a) => [a.name(), a.description, a.required, a.variadic]),
      );
    }
  });

  it("renders byte-for-byte identical help for the root, every command and every subcommand", () => {
    expect(specProgram.helpInformation()).toBe(realProgram.helpInformation());
    for (const [path, real, spec] of pairs(realProgram, specProgram)) {
      expect(spec.helpInformation(), `${path} --help`).toBe(real.helpInformation());
    }
  });

  it("exposes --auto-port on flisk up in both the real and generated programs", () => {
    for (const [name, program] of [
      ["real", realProgram],
      ["generated", specProgram],
    ] as const) {
      const up = program.commands.find((command) => command.name() === "up");
      expect(up, `${name} up command`).toBeDefined();
      expect(up?.options.some((option) => option.flags === "--auto-port")).toBe(true);
    }
  });

  it("has a lazy module for every registered command", async () => {
    const { LAZY_COMMANDS } = await import("../lazy-command.js");
    const missing = realProgram.commands
      .map((c) => c.name())
      .filter((name) => !(name in LAZY_COMMANDS));
    expect(missing).toEqual([]);
  });
});

const cliDir = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const fliskBin = join(cliDir, "bin", "flisk.js");

/** Runs the real CLI binary with a module-load marker in a heavy command module. */
function runWithProbe(
  args: string[],
  cwd: string,
): { status: number; output: string; loaded: boolean } {
  // The probe is written into a copy of dist/cli.js's sibling module by a preload script:
  // it records whether anything under generator/, components/ or commands/resource.js was
  // imported. A plain spawn is used so the marker runs in the real CLI process.
  const marker = join(cwd, "loaded-modules.txt");
  const preload = join(cwd, "trace.mjs");
  const hooks = join(cwd, "trace-hooks.mjs");
  writeFileSync(
    hooks,
    [
      'import { appendFileSync } from "node:fs";',
      `const out = ${JSON.stringify(marker)};`,
      "export async function resolve(specifier, context, nextResolve) {",
      "  const result = await nextResolve(specifier, context);",
      "  if (/(\\/|\\\\)(generator|components|frontend-frameworks|backend-frameworks)(\\/|\\\\)|commands(\\/|\\\\)(resource|stack|doctor|up|logs|ui)\\.js/.test(result.url)) {",
      '    appendFileSync(out, result.url + "\\n");',
      "  }",
      "  return result;",
      "}",
    ].join("\n"),
  );
  writeFileSync(
    preload,
    [
      'import { register } from "node:module";',
      'import { pathToFileURL } from "node:url";',
      `register(pathToFileURL(${JSON.stringify(hooks)}).href);`,
    ].join("\n"),
  );
  try {
    rmSync(marker, { force: true });
  } catch {
    // No marker from a previous run.
  }
  const result = spawnSync(process.execPath, ["--import", preload, fliskBin, ...args], {
    cwd,
    encoding: "utf8",
    input: "",
    env: { ...process.env, NO_COLOR: "1" },
    timeout: 60_000,
  });
  const loaded = existsSync(marker) && readFileSync(marker, "utf8").trim().length > 0;
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    loaded,
  };
}

const tempRoot = mkdtempSync(join(tmpdir(), "flisk-lazy-imports-"));
afterAll(() => rmSync(tempRoot, { recursive: true, force: true }));

describe("CLI cold start (#4212)", () => {
  it.each(["resource", "stack", "doctor", "up", "logs", "config", "mcp"])(
    "flisk %s --help does not import any heavy command or generator module",
    (command) => {
      const result = runWithProbe([command, "--help"], tempRoot);
      expect(result.status).toBe(0);
      expect(result.output).toContain(`Usage: flisk ${command}`);
      expect(result.loaded, "a heavy module was imported for --help").toBe(false);
    },
  );

  it("an invalid resource name fails before the generator/engine modules load", () => {
    // The name is refused before requireProjectRoot(), so no project.json is needed.
    const project = mkdtempSync(join(tmpdir(), "flisk-invalid-name-"));
    try {
      const result = runWithProbe(["resource", "Bad", "--type", "backend", "--yes"], project);
      expect(result.status).toBe(1);
      expect(result.output).toContain('Resource name "Bad" is not valid');
      expect(result.loaded, "a heavy module was imported before name validation").toBe(false);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });

  it("prints help quickly, well under the old 0.28-0.55s subcommand cost", () => {
    const runs: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const start = performance.now();
      const result = spawnSync(process.execPath, [fliskBin, "resource", "--help"], {
        cwd: tempRoot,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
        timeout: 60_000,
      });
      runs.push(performance.now() - start);
      expect(result.status).toBe(0);
    }
    const median = [...runs].sort((a, b) => a - b)[1] ?? Number.POSITIVE_INFINITY;
    // Generous CI bound: the pre-fix macOS measurement was 0.52s for this command.
    expect(median).toBeLessThan(250);
  });

  it("watch-build refreshes specs on a single-line clean tsc summary", async () => {
    const mod = (await import(
      new URL("../../../scripts/watch-build.mjs", import.meta.url).href
    )) as {
      createWatchOutputHandler: (onCleanCompile: () => void) => (chunk: string) => void;
    };
    let refreshes = 0;
    const handle = mod.createWatchOutputHandler(() => {
      refreshes += 1;
    });
    handle("12:00:00 PM - Starting compilation in watch mode...\n");
    handle("12:00:01 PM - Found 0 errors. Watching for file changes.\n");
    expect(refreshes).toBe(1);

    handle("12:00:02 PM - File change detected. Starting incremental compilation...\n");
    handle("12:00:03 PM - src/foo.ts(1,1): error TS2304: Cannot find name 'x'.\n");
    handle("12:00:03 PM - Found 1 error. Watching for file changes.\n");
    expect(refreshes).toBe(1);
  });
});
