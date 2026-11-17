import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  createMachineEnvelope
} from "./chunk-3SNMUNQF.js";
import {
  promptConfirm
} from "./chunk-3EZ4UDYT.js";
import {
  showCancelled
} from "./chunk-ARPSTQFE.js";
import {
  FliskError,
  showErrorAndExit
} from "./chunk-73W4Y4TI.js";

// dist/utils/command-helpers.js
import { writeSync } from "node:fs";

// dist/utils/command-suggestions.js
var UNKNOWN_COMMAND_SUGGESTIONS = {
  ports: ["networks"],
  port: ["networks"],
  services: ["resources", "status"],
  service: ["resource"],
  ps: ["resources", "status"],
  start: ["up"],
  stop: ["down"],
  build: ["up"]
};
function formatDidYouMean(targets) {
  if (targets.length === 0)
    return "";
  if (targets.length === 1)
    return `
(Did you mean ${targets[0]}?)`;
  return `
(Did you mean one of ${targets.join(", ")}?)`;
}
function rewriteUnknownCommandMessage(message) {
  const match = /^(error: unknown command '([^']+)')(?:\n\(Did you mean [^\n]*\?\))?(\s*)$/.exec(message);
  if (!match?.[1] || !match[2])
    return message;
  const targets = UNKNOWN_COMMAND_SUGGESTIONS[match[2]];
  if (!targets)
    return message;
  return `${match[1]}${formatDidYouMean(targets)}${match[3] ?? ""}`;
}

// dist/utils/command-helpers.js
var YES_OPTION_FLAGS = "-y, --yes";
var YES_OPTION_DESCRIPTION = "Skip prompts and confirmations; use defaults";
var NO_POSITIONAL_HINTS = {
  down: "Service names are not positional: down stops the whole project. Use: flisk down (or flisk down --project <path>)",
  status: "Service names are not positional: status shows the whole project. Use: flisk status (or flisk logs --service <name>)",
  logs: "Service names are not positional. Use: flisk logs --service <name>",
  networks: "Service names are not positional: `flisk networks` lists every service and takes no resource name.",
  projects: "Project and resource names are not positional: `flisk projects` shows the current project."
};
var NO_POSITIONAL_SUGGESTIONS = {
  networks: [
    "Filter by stack: flisk networks --stack <stack>",
    "One service: flisk networks --json (pick the service from data.services)"
  ],
  projects: [
    "Show the current project: flisk projects (run from the project directory)",
    "Check its configuration: flisk projects --check",
    "Get project details as JSON: flisk projects --json"
  ]
};
function isJsonRequested(command) {
  try {
    if (command.opts()?.json === true)
      return true;
  } catch {
  }
  let root = command;
  while (root.parent)
    root = root.parent;
  const raw = root.rawArgs ?? [];
  const args = raw.length > 0 ? raw : process.argv.slice(2);
  const end = args.indexOf("--");
  return (end === -1 ? args : args.slice(0, end)).includes("--json");
}
function splitDidYouMean(message) {
  const match = /^([\s\S]*?)\n\((Did you mean [^\n]*\?)\)\s*$/.exec(message);
  if (!match?.[1] || !match[2])
    return { message };
  return { message: match[1], didYouMean: match[2] };
}
function routeUsageErrorsToJson(command, hint) {
  const output = command.configureOutput();
  const outputError = output.outputError ?? ((str, write) => write(str));
  const writeErr = output.writeErr ?? ((str) => process.stderr.write(str));
  const rewriteMessage = (str) => command.parent === null ? rewriteUnknownCommandMessage(str) : str;
  command.configureOutput({
    outputError: (str, write) => {
      if (isJsonRequested(command))
        return;
      outputError(rewriteMessage(str), write);
    },
    writeErr: (str) => {
      if (isJsonRequested(command))
        return;
      writeErr(str);
    }
  });
  command.exitOverride((err) => {
    if (err.exitCode === 0)
      process.exit(0);
    if (err.code === "commander.conflictingOption")
      err.exitCode = 2;
    if (isJsonRequested(command)) {
      const { message, didYouMean } = splitDidYouMean(rewriteMessage(err.message));
      const suggestions = [
        ...didYouMean ? [didYouMean] : [],
        ...err.code === "commander.excessArguments" && hint ? [hint] : []
      ];
      const envelope = createMachineEnvelope(null, [
        { code: "USAGE", message, ...suggestions.length > 0 ? { suggestions } : {} }
      ]);
      writeSync(1, `${JSON.stringify(envelope)}
`);
    }
    process.exit(err.exitCode ?? 1);
  });
  return command;
}
function attachNoPositionalHint(command, commandName = command.name()) {
  const hint = NO_POSITIONAL_HINTS[commandName];
  if (!hint)
    return command;
  const suggestions = NO_POSITIONAL_SUGGESTIONS[commandName];
  if (suggestions) {
    command.allowExcessArguments().hook("preAction", () => {
      if (command.args.length === 0)
        return;
      const enteredName = command.parent?.args[0] ?? commandName;
      const name = [commandName, ...command.aliases()].includes(enteredName) ? enteredName : commandName;
      const formatTypedName = (text) => text.replaceAll(`flisk ${commandName}`, `flisk ${name}`);
      const error = new FliskError(formatTypedName(hint), suggestions.map(formatTypedName));
      if (isJsonRequested(command)) {
        const envelope = createMachineEnvelope(null, [
          { code: "USAGE", message: error.message, suggestions: error.suggestions }
        ]);
        writeSync(1, `${JSON.stringify(envelope)}
`);
        process.exit(error.exitCode);
      }
      error.exit();
    });
    return routeUsageErrorsToJson(command);
  }
  let originalShowHelp = `
${hint}`;
  Object.defineProperty(command, "_showHelpAfterError", {
    get() {
      if (isJsonRequested(command))
        return false;
      return originalShowHelp;
    },
    set(val) {
      originalShowHelp = val;
    },
    configurable: true,
    enumerable: true
  });
  return routeUsageErrorsToJson(command, hint);
}
function addYesOption(command, description = YES_OPTION_DESCRIPTION) {
  return command.option(YES_OPTION_FLAGS, description, false);
}
async function confirmAction(message, defaultValue = true) {
  const confirm = await promptConfirm({ message, initial: defaultValue });
  if (!confirm) {
    showCancelled();
  }
  return confirm;
}
function assertValid(validation, exitCode = 1) {
  if (!validation.valid) {
    showErrorAndExit(validation.error ?? "Validation failed", exitCode);
  }
}
function handleDryRun(options, description, command, printPlan) {
  if (options.dryRun) {
    if (printPlan) {
      printPlan();
    } else {
      console.log(`Dry run - ${description}`);
      console.log(`Would run: ${command}`);
    }
    return true;
  }
  return false;
}
async function confirmOrCancel(message, onCancel) {
  const confirmed = await confirmAction(message, true);
  if (!confirmed) {
    if (onCancel) {
      onCancel();
    }
    return false;
  }
  return true;
}

export {
  NO_POSITIONAL_HINTS,
  routeUsageErrorsToJson,
  attachNoPositionalHint,
  addYesOption,
  assertValid,
  handleDryRun,
  confirmOrCancel
};
