// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import chalk from "chalk";
import { Command } from "commander";
import { readProjectConfig } from "../generator/template-engine.js";
import { requireProjectRoot } from "../utils/errors.js";
import { cloneMissingRepos } from "../utils/project-repos.js";

export const reposCommand = new Command("repos").description(
  "Manage external Git service repositories",
);

reposCommand
  .command("clone")
  .description("Clone missing service repositories configured in .flisk/project.json")
  .option("--json", "Output JSON result", false)
  .action(async (options) => {
    const projectRoot = requireProjectRoot();
    const config = readProjectConfig(projectRoot);
    const repos = config.repos ?? [];

    if (repos.length === 0) {
      if (options.json) {
        console.log(
          JSON.stringify({
            schemaVersion: 1,
            data: { cloned: [], existing: [] },
            errors: [],
          }),
        );
      } else {
        console.log(chalk.gray("No external repositories configured in .flisk/project.json."));
      }
      return;
    }

    const results = await cloneMissingRepos(projectRoot, repos);
    const cloned = results.filter((r) => r.cloned);
    const existing = results.filter((r) => r.skipped);

    if (options.json) {
      console.log(
        JSON.stringify({
          schemaVersion: 1,
          data: {
            cloned: cloned.map((r) => ({ url: r.url, dir: r.dir })),
            existing: existing.map((r) => ({ url: r.url, dir: r.dir })),
          },
          errors: [],
        }),
      );
      return;
    }

    for (const item of results) {
      if (item.cloned) {
        console.log(chalk.green(`✓ Cloned ${item.url} into ${item.dir}`));
      } else {
        console.log(chalk.gray(`○ Kept existing folder ${item.dir} untouched`));
      }
    }
  });
