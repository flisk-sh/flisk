import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  cloneMissingRepos
} from "./chunk-AQDZHQMD.js";
import {
  readProjectConfig
} from "./chunk-RYTYYP36.js";
import {
  createMachineEnvelope,
  toMachineError
} from "./chunk-3SNMUNQF.js";
import {
  requireProjectRoot,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/repos.js
import { Command } from "commander";
var reposCommand = new Command("repos").description("Clone the Git repositories listed in .flisk/project.json");
reposCommand.command("clone").description("Clone missing service repositories configured in .flisk/project.json").addHelpText("after", '\nEach entry of "repos" in .flisk/project.json has url, dir (relative to the project root), and optional branch.\nExisting directories are left untouched. flisk up also clones missing repositories.\n\nExamples:\n  flisk repos clone\n  flisk repos clone --json\n\nDocs: https://github.com/flisk-sh/flisk/blob/main/docs/layout.md').option("--json", "Output JSON result", false).action(async (options) => {
  if (options.json) {
    try {
      const projectRoot2 = requireProjectRoot();
      const repos2 = readProjectConfig(projectRoot2).repos ?? [];
      const results2 = repos2.length > 0 ? await cloneMissingRepos(projectRoot2, repos2) : [];
      console.log(JSON.stringify({
        schemaVersion: 1,
        data: {
          cloned: results2.filter((r) => r.cloned).map((r) => ({ url: r.url, dir: r.dir })),
          existing: results2.filter((r) => r.skipped).map((r) => ({ url: r.url, dir: r.dir }))
        },
        errors: []
      }));
    } catch (error) {
      const { error: machineError, exitCode } = toMachineError(error);
      console.log(JSON.stringify(createMachineEnvelope(null, [{ ...machineError, code: "REPOS_FAILED" }])));
      process.exitCode = exitCode;
    }
    return;
  }
  const projectRoot = requireProjectRoot();
  const config = readProjectConfig(projectRoot);
  const repos = config.repos ?? [];
  if (repos.length === 0) {
    console.log(source_default.gray("No external repositories configured in .flisk/project.json."));
    return;
  }
  const results = await cloneMissingRepos(projectRoot, repos);
  for (const item of results) {
    if (item.cloned) {
      console.log(source_default.green(`\u2713 Cloned ${item.url} into ${item.dir}`));
    } else {
      console.log(source_default.gray(`\u25CB Kept existing folder ${item.dir} untouched`));
    }
  }
});

export {
  reposCommand
};
