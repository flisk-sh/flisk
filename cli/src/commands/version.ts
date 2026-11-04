// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Command } from "commander";
import { getBuildCommit, getPackageVersion } from "../utils/paths.js";

export const versionCommand = new Command("version")
  .description("Display version number")
  .alias("v")
  .option("-v, --verbose", "Display verbose version with build commit SHA", false)
  .action((options: { verbose?: boolean }) => {
    const version = getPackageVersion();
    const isVerbose = Boolean(
      options.verbose || versionCommand.opts().verbose || versionCommand.parent?.opts().verbose,
    );
    if (isVerbose) {
      const commit = getBuildCommit();
      console.log(`${version} (${commit})`);
    } else {
      console.log(version);
    }
  });
