import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  createMachineEnvelope,
  toMachineError
} from "./chunk-3SNMUNQF.js";
import {
  FliskError,
  ProcessExitError,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/utils/json-command.js
import { writeSync } from "node:fs";
import { format, stripVTControlCharacters } from "node:util";
var JsonCommandError = class extends FliskError {
  code;
  constructor(code, message, suggestions = [], exitCode = 1) {
    super(message, suggestions, exitCode);
    this.name = "JsonCommandError";
    this.code = code;
  }
};
var MAX_STDERR_MESSAGE = 2e3;
function failureFromStderr(text, fallback) {
  const lines = stripVTControlCharacters(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const suggestions = lines.filter((line) => line.startsWith("\u2192")).map((line) => line.replace(/^→\s*/, ""));
  const errorLine = lines.find((line) => line.startsWith("\u274C"));
  const rest = lines.filter((line) => !line.startsWith("\u2192")).join("\n");
  const message = errorLine ? errorLine.replace(/^❌\s*/, "") : rest.slice(0, MAX_STDERR_MESSAGE) || fallback;
  return { message, ...suggestions.length > 0 ? { suggestions } : {} };
}
function describeFailure(error) {
  if (error instanceof JsonCommandError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...error.suggestions.length > 0 ? { suggestions: error.suggestions } : {}
      },
      exitCode: error.exitCode
    };
  }
  return toMachineError(error);
}
async function runJsonCommand(failureCode, command, action) {
  const stdout = process.stdout;
  const original = {
    write: stdout.write,
    log: console.log,
    info: console.info,
    debug: console.debug,
    error: console.error,
    level: source_default.level
  };
  let printedErrors = "";
  let emitted = false;
  const emit = (envelope, sync = false) => {
    if (emitted)
      return;
    emitted = true;
    const line = `${JSON.stringify(envelope)}
`;
    if (sync)
      writeSync(1, line);
    else
      original.write.call(stdout, line);
  };
  const exitFailure = (exitCode) => ({
    code: failureCode,
    ...failureFromStderr(printedErrors, `${command} exited with code ${exitCode}`)
  });
  const onExit = (exitCode) => {
    emit(createMachineEnvelope(null, [exitFailure(exitCode)]), true);
  };
  const restore = () => {
    stdout.write = original.write;
    console.log = original.log;
    console.info = original.info;
    console.debug = original.debug;
    console.error = original.error;
    source_default.level = original.level;
    process.off("exit", onExit);
  };
  const toStderr = (...args) => original.error.apply(console, args.length > 0 ? args : [""]);
  source_default.level = 0;
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
  console.error = (...args) => {
    printedErrors += `${format(...args)}
`;
    toStderr(...args);
  };
  stdout.write = ((...args) => process.stderr.write(...args));
  process.on("exit", onExit);
  let result;
  try {
    result = await action();
  } catch (error) {
    if (error instanceof ProcessExitError) {
      emit(createMachineEnvelope(null, [exitFailure(error.code)]));
      restore();
      throw error;
    }
    restore();
    const failure = describeFailure(error);
    emit(createMachineEnvelope(null, [failure.error]));
    if (!printedErrors.includes(failure.error.message))
      console.error(failure.error.message);
    process.exit(failure.exitCode);
  }
  restore();
  emit(createMachineEnvelope(result.data, result.errors ?? []));
  if (result.exitCode)
    process.exit(result.exitCode);
}

export {
  JsonCommandError,
  runJsonCommand
};
