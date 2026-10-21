#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";

import { showHelp } from "./commands/help.js";
import { createProgram } from "./program.js";
import { ensureGlobalInstall } from "./utils/cli-command.js";
import { formatColdPreflight, runColdPreflight } from "./utils/cold-preflight.js";
import { unknownHelpTarget } from "./utils/help-command.js";

const program = createProgram();

// Default: show help if no command provided
if (process.argv.length === 2) {
  const result = await runColdPreflight();
  console.log(formatColdPreflight(result));
  await ensureGlobalInstall();
  console.log("\nCommands: flisk doctor | flisk project --yes | flisk --help");
  console.log("\nOne command from scratch (installs, clones, boots and opens the browser):");
  console.log("  npx @flisk-sh/flisk demo");
  console.log("  npx @flisk-sh/flisk restaurant --project=my-stack");
  process.exit(result.ok ? 0 : 1);
}

// One command from scratch: flisk <template> | flisk --template <name> --project <dir>
// It clones a starter, installs the CLI globally, boots the stack and opens the frontend.
const templateArg =
  readOptionValue(process.argv, "--template") ?? (await bareTemplateArg(process.argv));
const projectArg = readOptionValue(process.argv, "--project");
if (templateArg) {
  const { cloneProjectTemplate } = await import("./commands/project.js");
  const { assertMachineReadyOrExit, detectRuntimePrerequisites, formatRuntimeNextSteps } =
    await import("./utils/cold-preflight.js");
  const { PROJECT_TEMPLATES } = await import("./utils/project-templates.js");
  await assertMachineReadyOrExit({ scope: "scaffold" });
  const runtimeNextSteps = formatRuntimeNextSteps(detectRuntimePrerequisites());
  await cloneProjectTemplate(templateArg, projectArg, runtimeNextSteps);

  const install = ensureGlobalInstall();
  if (install === "installed") {
    console.log("\n\u2714 flisk is installed globally, so `flisk` works from any folder.");
  }

  const destination = resolve(cwd(), projectArg || templateArg);
  const binPath = process.argv[1];
  if (binPath && existsSync(destination)) {
    const { runStack, findFrontendUrl } = await import("./utils/one-command.js");
    const { openUrl } = await import("./utils/url-actions.js");
    console.log(`\n\u{1F680} Starting the stack in ${destination}...\n`);
    const result = await runStack(binPath, destination);
    const url = findFrontendUrl(result.output);
    if (url) {
      console.log(`\n\u{1F310} Opening ${url}`);
      await openUrl(url);
    }
  }
  process.exit(0);
}

if (process.argv[2] === "--doctor") process.argv[2] = "doctor";

if (process.argv.length === 3 && ["-h", "--help", "help"].includes(process.argv[2])) {
  showHelp();
  process.exit(0);
}

const unknownHelp = unknownHelpTarget(process.argv.slice(2), program.commands);
if (unknownHelp) {
  program.error(`error: unknown command '${unknownHelp}'`, {
    exitCode: 1,
    code: "commander.unknownCommand",
  });
}

program.parse();

/** Reads `--name value` and `--name=value` out of the raw arguments. */
function readOptionValue(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === name) return args[index + 1];
  }
  return undefined;
}

/** A bare template name (`flisk restaurant`) is the short form of `--template restaurant`. */
async function bareTemplateArg(args: string[]): Promise<string | undefined> {
  const { PROJECT_TEMPLATES } = await import("./utils/project-templates.js");
  for (const arg of args.slice(2)) {
    if (arg.startsWith("-")) continue;
    if (arg in PROJECT_TEMPLATES) return arg;
  }
  return undefined;
}
