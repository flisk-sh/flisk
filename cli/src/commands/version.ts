// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { Command } from "commander";
import { getPackageVersion } from "../utils/paths.js";

export const versionCommand = new Command("version")
  .description("Display version number")
  .alias("v")
  .action(() => {
    console.log(getPackageVersion());
  });
