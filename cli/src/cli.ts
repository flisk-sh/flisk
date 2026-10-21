#!/usr/bin/env node
// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";

import chalk from "chalk";

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
  const { cloneProjectTemplate, templateTargetDir } = await import("./commands/project.js");
  const { assertMachineReadyOrExit, detectRuntimePrerequisites, formatRuntimeNextSteps } =
    await import("./utils/cold-preflight.js");
  const { PROJECT_TEMPLATES } = await import("./utils/project-templates.js");
  await assertMachineReadyOrExit({ scope: "scaffold" });
  const runtimeNextSteps = formatRuntimeNextSteps(detectRuntimePrerequisites());

  // A second demo in the same folder gets its own directory instead of failing.
  const { nextAvailableProjectDir } = await import("./utils/one-command.js");
  const baseName = templateTargetDir(templateArg, projectArg);
  const targetName = nextAvailableProjectDir(baseName, (candidate) => {
    const path = resolve(cwd(), candidate);
    return existsSync(path) && readdirSync(path).length > 0;
  });
  const destination = resolve(cwd(), targetName);
  if (targetName !== baseName) {
    console.log(chalk.gray(`The folder ${baseName} is taken, using ${targetName} instead.`));
  }

  await cloneProjectTemplate(templateArg, targetName, runtimeNextSteps);

  const install = ensureGlobalInstall();
  if (install === "installed") {
    console.log("\n\u2714 flisk is installed globally, so `flisk` works from any folder.");
  }
  const binPath = process.argv[1];
  if (binPath && existsSync(destination)) {
    const { initializeProject, installServiceDependencies, runStackQuiet } = await import(
      "./utils/one-command.js"
    );
    const { openFirstFrontend } = await import("./commands/open.js");
    const { startSpinner } = await import("./utils/spinner.js");

    // A stack for this project may already be running (the same example in another folder
    // shares its compose project). Then there is nothing to start: open what is up.
    const { findReadyFrontend } = await import("./commands/open.js");
    const running = await findReadyFrontend(destination, 0);
    if (running) {
      console.log(chalk.gray(`A stack for this project is already running (${running.name}).`));
      const { openFirstFrontend } = await import("./commands/open.js");
      await openFirstFrontend(destination);
      process.exit(0);
    }

    // A cloned starter has no project configuration yet, and `flisk up` refuses to run
    // without one, so the project is set up before the stack starts.
    const setupSpinner = startSpinner("Setting up the project...");
    const setup = await initializeProject(binPath, destination);
    if (!setup.ok) {
      setupSpinner.fail("The project setup failed.");
      console.log(chalk.yellow(setup.error ?? "flisk project --yes did not finish."));
      process.exit(1);
    }
    setupSpinner.succeed("The project is ready.");

    // A fresh clone has no host dependencies, and the stack typechecks the services on the
    // host, so install them before the stack starts.
    const installSpinner = startSpinner("Installing the service dependencies...");
    const installs = await installServiceDependencies(destination);
    const failed = installs.filter((entry) => !entry.ok);
    if (failed.length > 0) {
      installSpinner.fail("Some services could not install their dependencies.");
      for (const entry of failed) {
        console.log(chalk.yellow(`  - ${entry.dir}: run "bun install" there`));
      }
    } else {
      installSpinner.succeed("The service dependencies are installed.");
    }

    const spinner = startSpinner("Starting the stack (the first build takes a minute)...");
    const outcome = await runStackQuiet(binPath, destination);
    if (!outcome.ok) {
      spinner.fail("The stack did not come up.");
      console.log(chalk.yellow(outcome.error ?? "The stack stopped before it was ready."));
      console.log(chalk.gray("Run `flisk up` in that folder to see the full output."));
      process.exit(1);
    }
    spinner.succeed("The stack is up.");

    // The browser only opens when a frontend actually answers, the same way `flisk open` does.
    const opened = await openFirstFrontend(destination).catch((error: unknown) => {
      console.log(
        chalk.yellow(
          `Could not open a browser: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return null;
    });
    if (!opened) {
      console.log(
        chalk.gray(`The stack is running. Open it yourself: cd ${destination} && flisk open`),
      );
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
