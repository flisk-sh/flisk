import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  createMachineEnvelope
} from "./chunk-3SNMUNQF.js";
import {
  getBuildCommit,
  getPackageVersion
} from "./chunk-73W4Y4TI.js";

// dist/commands/version.js
import { Command } from "commander";
var versionCommand = new Command("version").description("Display version number").alias("v").option("-v, --verbose", "Display verbose version with build commit SHA", false).option("--json", "Output a versioned JSON envelope", false).action((options) => {
  const version = getPackageVersion();
  const isJson = Boolean(options.json || versionCommand.opts().json || versionCommand.parent?.opts().json);
  if (isJson) {
    console.log(JSON.stringify(createMachineEnvelope({
      version,
      commit: getBuildCommit()
    })));
    return;
  }
  const isVerbose = Boolean(options.verbose || versionCommand.opts().verbose || versionCommand.parent?.opts().verbose);
  if (isVerbose) {
    const commit = getBuildCommit();
    console.log(`${version} (${commit})`);
  } else {
    console.log(version);
  }
});

export {
  versionCommand
};
