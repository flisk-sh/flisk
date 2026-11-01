// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { readProjectConfig } from "../generator/template-engine.js";
import { requireProjectRoot } from "../utils/errors.js";
import { createMachineEnvelope, toMachineError } from "../utils/machine-output.js";
import { cloneMissingRepos } from "../utils/project-repos.js";

export const reposCommand = new Command("repos").description(
  "Manage external Git service repositories",
);

reposCommand
  .command("clone")
  .description("Clone missing service repositories configured in .flisk/project.json")
  .option("--json", "Output JSON result", false)
  .action(async (options) => {
    if (options.json) {
      try {
        const projectRoot = requireProjectRoot();
        const repos = readProjectConfig(projectRoot).repos ?? [];
        const results = repos.length > 0 ? await cloneMissingRepos(projectRoot, repos) : [];
        console.log(
          JSON.stringify({
            schemaVersion: 1,
            data: {
              cloned: results.filter((r) => r.cloned).map((r) => ({ url: r.url, dir: r.dir })),
              existing: results.filter((r) => r.skipped).map((r) => ({ url: r.url, dir: r.dir })),
            },
            errors: [],
          }),
        );
      } catch (error) {
        // Every --json failure writes one error envelope on stdout, as the other --json commands do.
        const { error: machineError, exitCode } = toMachineError(error);
        console.log(
          JSON.stringify(createMachineEnvelope(null, [{ ...machineError, code: "REPOS_FAILED" }])),
        );
        process.exitCode = exitCode;
      }
      return;
    }

    const projectRoot = requireProjectRoot();
    const config = readProjectConfig(projectRoot);
    const repos = config.repos ?? [];

    if (repos.length === 0) {
      console.log(chalk.gray("No external repositories configured in .flisk/project.json."));
      return;
    }

    const results = await cloneMissingRepos(projectRoot, repos);

    for (const item of results) {
      if (item.cloned) {
        console.log(chalk.green(`✓ Cloned ${item.url} into ${item.dir}`));
      } else {
        console.log(chalk.gray(`○ Kept existing folder ${item.dir} untouched`));
      }
    }
  });
