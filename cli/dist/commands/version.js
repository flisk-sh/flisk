// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Command } from "commander";
import { jsonOption } from "../utils/command-helpers.js";
import { createMachineEnvelope } from "../utils/machine-output.js";
import { getBuildCommit, getPackageVersion } from "../utils/paths.js";
export const versionCommand = new Command("version")
    .description("Display version number")
    .alias("v")
    .option("-v, --verbose", "Display verbose version with build commit SHA", false)
    .addOption(jsonOption())
    .action((options) => {
    const version = getPackageVersion();
    const isJson = Boolean(options.json || versionCommand.opts().json || versionCommand.parent?.opts().json);
    if (isJson) {
        console.log(JSON.stringify(createMachineEnvelope({
            version,
            commit: getBuildCommit(),
        })));
        return;
    }
    const isVerbose = Boolean(options.verbose || versionCommand.opts().verbose || versionCommand.parent?.opts().verbose);
    if (isVerbose) {
        const commit = getBuildCommit();
        console.log(`${version} (${commit})`);
    }
    else {
        console.log(version);
    }
});
