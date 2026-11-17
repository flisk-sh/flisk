import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  FliskError,
  UnknownResourceError
} from "./chunk-73W4Y4TI.js";

// dist/utils/machine-output.js
var SCHEMA_VERSION = 1;
function createMachineEnvelope(data, errors = []) {
  return { schemaVersion: SCHEMA_VERSION, data, errors };
}
function toMachineError(error) {
  if (error instanceof FliskError) {
    return {
      error: {
        code: error instanceof UnknownResourceError ? error.code : "COMMAND_FAILED",
        message: error.message,
        ...error.suggestions.length > 0 ? { suggestions: error.suggestions } : {}
      },
      exitCode: error.exitCode
    };
  }
  return {
    error: {
      code: "INTERNAL",
      message: error instanceof Error ? error.message : String(error)
    },
    exitCode: 2
  };
}
function writeMachineError(error) {
  const result = toMachineError(error);
  console.log(JSON.stringify(createMachineEnvelope(null, [result.error])));
  console.error(result.error.message);
  process.exit(result.exitCode);
}

export {
  SCHEMA_VERSION,
  createMachineEnvelope,
  toMachineError,
  writeMachineError
};
