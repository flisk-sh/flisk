import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  evaluateFliskVersion
} from "./chunk-3SLZPPGL.js";
import {
  FliskError,
  getPackageVersion,
  showError,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/utils/flisk-version-gate.js
function enforceFliskVersionGate(projectRoot, options = {}, currentVersion = getPackageVersion(), exit = process.exit) {
  if (options.ignoreVersion) {
    console.warn(source_default.yellow("Warning: --ignore-version set; pinnedFliskVersion and minFliskVersion were not checked."));
    return;
  }
  const result = evaluateFliskVersion(projectRoot, currentVersion);
  if (result.deprecationWarning) {
    console.warn(source_default.yellow(`Warning: ${result.deprecationWarning}`));
  }
  if (result.status === "none" || result.status === "ok") {
    return;
  }
  const message = `${result.message}
${result.fix}`;
  options.onFail?.(message, result.status);
  if (options.json) {
    throw new FliskError(result.message, [result.fix], 1);
  }
  showError(message);
  exit(1);
}

export {
  enforceFliskVersionGate
};
