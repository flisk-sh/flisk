#!/usr/bin/env node
// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { showHelp } from "./commands/help.js";
import { createProgram } from "./program.js";
import { formatColdPreflight, runColdPreflight } from "./utils/cold-preflight.js";
import { unknownHelpTarget } from "./utils/help-command.js";
const program = createProgram();
// Default: show help if no command provided
if (process.argv.length === 2) {
    const result = await runColdPreflight();
    console.log(formatColdPreflight(result));
    console.log("\nCommands: tdk doctor | tdk project --yes | tdk --help");
    process.exit(result.ok ? 0 : 1);
}
if (process.argv[2] === "--doctor")
    process.argv[2] = "doctor";
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
