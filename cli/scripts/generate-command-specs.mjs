// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Regenerates `cli/src/commands/command-specs.generated.ts` from the real Commander
 * program. Run `npm --prefix cli run build` (or run this script directly, which compiles
 * `cli/dist` first unless `--no-compile` is passed) after changing a command's name,
 * options, arguments or help text.
 *
 * The build (`npm --prefix cli run build`) runs this first, so `cli/dist` can never
 * contain a spec table that disagrees with `commands/registry.ts`. Importing
 * `dist/program.js` here loads the full command graph once at build time; the CLI binary
 * itself never does that for help or cheap validation (#4212).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(here, "..");
const output = join(cliDir, "src", "commands", "command-specs.generated.ts");

// The generator reads dist/program.js, so compile TypeScript sources first unless the build
// script already ran `tsc` immediately prior (`--no-compile`).
const programFile = join(cliDir, "dist", "program.js");
if (!process.argv.includes("--no-compile")) {
  const tscBin = join(cliDir, "node_modules", "typescript", "bin", "tsc");
  execFileSync(process.execPath, [tscBin], { cwd: cliDir, stdio: "inherit" });
}

const { createProgram } = await import(pathToFileURL(programFile).href);
const program = createProgram();

function helpTexts(command) {
  const out = {};
  const events = {
    beforeAllHelp: "beforeAll",
    beforeHelp: "before",
    afterHelp: "after",
    afterAllHelp: "afterAll",
  };
  for (const [event, position] of Object.entries(events)) {
    for (const listener of command.listeners(event)) {
      let text = "";
      listener({ error: false, command, write: (chunk) => (text += chunk) });
      const value = text.endsWith("\n") ? text.slice(0, -1) : text;
      if (value) {
        if (!out[position]) out[position] = [];
        out[position].push(value);
      }
    }
  }
  return out;
}

function specOf(command, path) {
  return {
    name: command.name(),
    path,
    description: command.description(),
    aliases: command.aliases(),
    hidden: command._hidden === true,
    ...(command._helpOption === null ? { helpOptionDisabled: true } : {}),
    ...(command._showHelpAfterError ? { showHelpAfterError: command._showHelpAfterError } : {}),
    ...(command._helpOption && command._helpOption.flags !== "-h, --help"
      ? {
          helpOption: {
            flags: command._helpOption.flags,
            description: command._helpOption.description ?? "",
          },
        }
      : {}),
    hasAction: command._actionHandler !== null,
    allowUnknown: command._allowUnknownOption === true,
    passThrough: command._passThroughOptions === true,
    positionalOptions: command._enablePositionalOptions === true,
    allowExcessArguments: command._allowExcessArguments !== false,
    options: command.options.map((option) => ({
      flags: option.flags,
      description: option.description ?? "",
      ...(option.defaultValue !== undefined ? { defaultValue: option.defaultValue } : {}),
      ...(option.mandatory ? { mandatory: true } : {}),
      ...(option.argChoices ? { argChoices: option.argChoices } : {}),
      ...(option.envVar ? { envVar: option.envVar } : {}),
      ...(option.hidden ? { hidden: true } : {}),
      ...(option.presetArg !== undefined ? { presetArg: option.presetArg } : {}),
    })),
    arguments: command.registeredArguments.map((argument) => ({
      name: argument.name(),
      description: argument.description,
      required: argument.required,
      variadic: argument.variadic,
      ...(argument.defaultValue !== undefined ? { defaultValue: argument.defaultValue } : {}),
      ...(argument.argChoices ? { argChoices: argument.argChoices } : {}),
    })),
    helpTexts: helpTexts(command),
    subcommands: command.commands.map((sub) => specOf(sub, [...path, sub.name()])),
  };
}

const specs = program.commands.map((command) => specOf(command, [command.name()]));
const body = `// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * The CLI command tree as plain data, generated from \`commands/registry.ts\` by
 * \`cli/scripts/generate-command-specs.mjs\`. Do not edit by hand.
 *
 * \`cli.ts\` builds its Commander program from this table instead of importing every
 * command module. A heavy command file (generator, discovery, TUI, ...) is imported only
 * when that command actually runs, so \`flisk <command> --help\` and cheap argument
 * validation do not pay for the whole module graph (#4212).
 *
 * The parity test in \`src/commands/__tests__/command-specs.test.ts\` fails if this table
 * and \`createProgram()\` disagree about any command, option, argument or help text.
 */
import type { CommandSpec } from "./command-specs.js";

export const COMMAND_SPECS: readonly CommandSpec[] = ${toTypeScriptLiteral(specs, 0)};
`;

/** Emits a Biome-formatted TypeScript literal (unquoted keys, trailing commas). */
function toTypeScriptLiteral(value, indent) {
  const pad = "  ".repeat(indent);
  const next = "  ".repeat(indent + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => `${next}${toTypeScriptLiteral(item, indent + 1)},`).join("\n")}\n${pad}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    return `{\n${entries
      .map(
        ([key, v]) =>
          `${next}${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}: ${toTypeScriptLiteral(v, indent + 1)},`,
      )
      .join("\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}
// Biome owns the formatting of every .ts file, including generated ones. Format in memory via
// Node's executable (portable across Windows/macOS/Linux) and write only when content changed so
// watch mode never loops.
// Resolve through Node so an npm-workspace install (Biome hoisted to the repo root, as on the Windows runner)
// works the same as a local one under cli/node_modules.
const biomeBin = createRequire(import.meta.url).resolve("@biomejs/biome/bin/biome");
// A path relative to cliDir with forward slashes: Biome matches it against `files.includes`, and an absolute
// Windows path (`D:\a\flisk\...`) is not matched the way the same file is on macOS/Linux.
const outputRelative = relative(cliDir, output).split(sep).join("/");
let formatted;
try {
  formatted = execFileSync(
    process.execPath,
    [biomeBin, "format", "--stdin-file-path", outputRelative],
    {
      cwd: cliDir,
      input: body,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
} catch (error) {
  // Show why Biome refused: a bare "Command failed" hides the cause on CI.
  const detail = [error.stderr, error.stdout].filter(Boolean).join("\n").trim();
  if (process.env.CI) {
    throw new Error(`biome format failed for ${outputRelative}${detail ? `:\n${detail}` : ""}`, {
      cause: error,
    });
  }
  if (existsSync(output)) {
    console.warn(`Warning: biome format failed (${detail || error.message}), preserving existing formatted file`);
    formatted = readFileSync(output, "utf8");
  } else {
    formatted = body;
  }
}
const previous = existsSync(output) ? readFileSync(output, "utf8") : "";
if (previous !== formatted) {
  writeFileSync(output, formatted, "utf8");
}

// Check conflict/whitespace markers on the generated file when building inside a Git checkout;
// source archives without Git metadata still build cleanly.
if (existsSync(join(cliDir, "..", ".git"))) {
  execFileSync("git", ["diff", "--check", "--", output], { cwd: cliDir, stdio: "ignore" });
}
console.log(`Generated ${specs.length} command specs in ${output}`);
