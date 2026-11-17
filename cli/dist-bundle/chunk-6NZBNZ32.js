import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  findRunningFliskProjects
} from "./chunk-QQ2PAYEU.js";
import {
  writeMachineError
} from "./chunk-3SNMUNQF.js";
import {
  shellQuote
} from "./chunk-2BH5UW2N.js";
import {
  FliskError,
  errorFactories,
  findProjectRoot,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/utils/project-resolution.js
import { statSync } from "node:fs";
import { resolve } from "node:path";
function resolveCommandProject(options) {
  const { commandName, project, json = false, autoSelectSingleRunning = false } = options;
  const fail = (error) => {
    if (options.onFail) {
      return options.onFail(error);
    }
    if (json) {
      writeMachineError(error);
    }
    return error.exit();
  };
  let resolvedRoot;
  if (project) {
    const targetPath = resolve(project);
    let isDirectory = false;
    try {
      isDirectory = statSync(targetPath).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) {
      return fail(new FliskError(`No Flisk project at ${targetPath} (not an existing directory)`, [
        `Pass the folder of a Flisk project: flisk ${commandName} --project <path>`
      ]));
    }
    const root = findProjectRoot(targetPath);
    if (!root) {
      return fail(new FliskError(`No Flisk project at ${targetPath} (no .flisk/project.json found)`, [
        `Pass the folder of a Flisk project: flisk ${commandName} --project <path>`
      ]));
    }
    resolvedRoot = root;
  } else {
    const here = findProjectRoot();
    if (here) {
      resolvedRoot = here;
    } else {
      const running = findRunningFliskProjects();
      if (autoSelectSingleRunning && running.length === 1) {
        const root = running[0];
        if (!json) {
          console.log(source_default.gray(`Not in a Flisk project; stopping the one that is running: ${root}`));
        }
        resolvedRoot = root;
      } else if (running.length > 0) {
        const countText = running.length === 1 ? "1 Flisk project is running" : `${running.length} Flisk projects are running`;
        return fail(new FliskError(`Not in a Flisk project, and ${countText}`, running.map((root) => `flisk ${commandName} --project ${shellQuote(root)}`)));
      } else {
        const notInProject = errorFactories.notInProject();
        const suggestions = [...notInProject.suggestions];
        if (autoSelectSingleRunning) {
          suggestions.push(`Or name the project to stop from anywhere: flisk ${commandName} --project <path>`);
        }
        return fail(new FliskError(notInProject.message, suggestions, notInProject.exitCode));
      }
    }
  }
  if (findProjectRoot() !== resolvedRoot) {
    process.chdir(resolvedRoot);
  }
  return resolvedRoot;
}

export {
  resolveCommandProject
};
