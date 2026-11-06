import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  FliskError
} from "./chunk-NKTINEF4.js";

// dist/utils/prompt.js
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
async function question(prompt) {
  const rl = createInterface({ input, output });
  try {
    return await new Promise((resolve, reject) => {
      rl.once("close", () => reject(new Error("No input available to answer the prompt. Run this in a terminal.")));
      rl.question(prompt).then((answer) => resolve(answer.trim()), reject);
    });
  } finally {
    rl.close();
  }
}
async function promptText(options) {
  const suffix = options.initial ? ` (${options.initial})` : "";
  while (true) {
    const answer = await question(`${options.message}${suffix} `);
    const value = answer || options.initial || "";
    const validation = options.validate?.(value) ?? true;
    if (validation === true) {
      return value;
    }
    console.log(validation);
  }
}
async function promptConfirm(options) {
  const defaultValue = options.initial ?? true;
  const suffix = defaultValue ? "Y/n" : "y/N";
  while (true) {
    const answer = (await question(`${options.message} (${suffix}) `)).toLowerCase();
    if (!answer)
      return defaultValue;
    if (["y", "yes"].includes(answer))
      return true;
    if (["n", "no"].includes(answer))
      return false;
    console.log("Please answer yes or no.");
  }
}
async function promptSelect(options) {
  console.log(options.message);
  options.choices.forEach((choice, index) => {
    console.log(`  ${index + 1}. ${choice.title}`);
  });
  while (true) {
    const answer = await question("Choose one: ");
    const selectedIndex = Number.parseInt(answer, 10) - 1;
    const selected = options.choices[selectedIndex];
    if (selected) {
      return selected.value;
    }
    console.log(`Enter a number from 1 to ${options.choices.length}.`);
  }
}
async function promptMultiSelect(options) {
  const defaults = options.choices.map((choice, index) => choice.selected ? index + 1 : null).filter((index) => index !== null);
  const defaultHint = defaults.length > 0 ? ` [${defaults.join(",")}]` : "";
  console.log(options.message);
  options.choices.forEach((choice, index) => {
    const marker = choice.selected ? "*" : " ";
    console.log(` ${marker} ${index + 1}. ${choice.title}`);
  });
  while (true) {
    const answer = await question(`Choose one or more numbers, comma-separated${defaultHint}: `);
    let rawIndexes = defaults;
    if (answer) {
      const tokens = answer.split(",").map((value) => value.trim());
      const invalidToken = tokens.find((token) => {
        if (!/^\d+$/.test(token))
          return true;
        const index = Number.parseInt(token, 10);
        return !options.choices[index - 1];
      });
      if (invalidToken !== void 0) {
        console.log(`"${invalidToken}" is not a valid choice (1-${options.choices.length})`);
        continue;
      }
      rawIndexes = tokens.map((token) => Number.parseInt(token, 10));
    }
    const selected = Array.from(new Set(rawIndexes)).map((index) => options.choices[index - 1]).filter((choice) => Boolean(choice)).map((choice) => choice.value);
    const validation = options.validate?.(selected) ?? true;
    if (validation === true) {
      return selected;
    }
    console.log(validation);
  }
}

// dist/utils/machine-output.js
var SCHEMA_VERSION = 1;
function createMachineEnvelope(data, errors = []) {
  return { schemaVersion: SCHEMA_VERSION, data, errors };
}
function toMachineError(error) {
  if (error instanceof FliskError) {
    return {
      error: {
        code: "COMMAND_FAILED",
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
  writeMachineError,
  promptText,
  promptConfirm,
  promptSelect,
  promptMultiSelect
};
