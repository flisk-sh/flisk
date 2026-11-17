import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);

// dist/utils/cli-invocation.js
import { existsSync } from "node:fs";
function cliInvocation(execPath = process.execPath, script = process.argv[1], fileExists = existsSync) {
  if (!script || script.startsWith("/$bunfs/") || script.includes("~BUN") || !fileExists(script)) {
    return [execPath];
  }
  return [execPath, script];
}

export {
  cliInvocation
};
