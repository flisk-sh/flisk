// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * The root program.
 *
 * The commands live in `commands/registry.ts`; this module wires them into a Commander program.
 * The shell completion generator reads the same program, so the completions and the CLI can never
 * disagree about which commands and flags exist.
 */
import chalk from "chalk";
import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { showHelp } from "./commands/help.js";
import { getRegisteredCommands } from "./commands/registry.js";
/** Builds the root program with every registered command. */
export function createProgram() {
    const program = new Command();
    program
        .name("flisk")
        .description("Flisk CLI — start services on your machine.")
        .version(pkg.version, "-v, --version", "Display version number")
        .option("--verbose", "Enable verbose output", false)
        .option("--template <name>", "Create a project from a starter template in one command (restaurant, saas, erp, ecommerce, example)")
        .option("--project <dir>", "Directory to create the project in (default: the template name)")
        .configureOutput({
        outputError: (str, write) => write(chalk.red(str)),
        writeOut: (str) => process.stdout.write(str),
        writeErr: (str) => process.stderr.write(str),
    });
    program.helpCommand("help [command]", "Show colorful help").on("--help", () => {
        showHelp();
        process.exit(0);
    });
    program.addHelpText("before", "");
    for (const command of getRegisteredCommands()) {
        program.addCommand(command);
    }
    return program;
}
