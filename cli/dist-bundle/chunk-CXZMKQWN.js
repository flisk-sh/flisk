import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  TOOL_CATALOG,
  findTool,
  manualSteps,
  resourceArgs,
  toolIds
} from "./chunk-HN4WUGQ5.js";
import {
  runJsonCommand
} from "./chunk-FU6O43SU.js";
import {
  cliInvocation
} from "./chunk-CFZG7IYF.js";
import {
  addYesOption
} from "./chunk-MJGDAK6E.js";
import {
  createMachineEnvelope
} from "./chunk-3SNMUNQF.js";
import {
  discoverResourcesWithProblems,
  isNativeProject
} from "./chunk-2BH5UW2N.js";
import {
  validateResourceName,
  validateStackName
} from "./chunk-UPCGXTMS.js";
import {
  FliskError,
  errorFactories,
  findProjectRoot,
  runCommand,
  source_default,
  suggestClosest
} from "./chunk-73W4Y4TI.js";

// dist/commands/tool.js
import { spawnSync } from "node:child_process";
import { Command } from "commander";
function listTools(options = {}) {
  if (options.json)
    return { tools: TOOL_CATALOG.map((tool) => describeTool(tool)) };
  for (const line of formatToolList())
    console.log(line);
  return void 0;
}
var GROUP_TITLES = {
  frontend: "Frontend",
  backend: "Backend",
  data: "Data",
  ai: "AI",
  devops: "DevOps",
  widgets: "Widgets (cards in Flisk Chat)",
  guidewire: "Guidewire",
  cloud: "Not added (cloud and clusters)"
};
var STATUS_LABEL = {
  resource: "adds a resource",
  "built-in": "built in",
  manual: "manual steps",
  rejected: "rejected"
};
function formatToolList() {
  const lines = ["Tools you can add with flisk tool add <tool> [name]:", ""];
  for (const group of Object.keys(GROUP_TITLES)) {
    const tools = TOOL_CATALOG.filter((tool) => tool.group === group);
    if (tools.length === 0)
      continue;
    lines.push(GROUP_TITLES[group]);
    for (const tool of tools) {
      lines.push(`  ${tool.id.padEnd(16)} ${tool.title.padEnd(36)} ${STATUS_LABEL[tool.status]}`);
    }
    lines.push("");
  }
  return lines;
}
function describeTool(tool, options = {}) {
  const base = { id: tool.id, title: tool.title, group: tool.group, status: tool.status };
  switch (tool.status) {
    case "resource":
      return { ...base, command: ["flisk", ...resourceArgs(tool, options)].join(" ") };
    case "built-in":
      return { ...base, note: tool.note };
    case "manual":
      return { ...base, reason: tool.reason, steps: manualSteps(tool, options.name) };
    case "rejected":
      return { ...base, reason: tool.reason, instead: tool.instead };
  }
}
function unknownTool(input) {
  const ids = toolIds();
  const closest = suggestClosest(input, ids);
  return new FliskError(`Flisk does not know the tool "${input}".`, [
    ...closest ? [`Did you mean "${closest}"?`] : [],
    `Use one of: ${ids.join(", ")}.`,
    "See them grouped with: flisk tool list"
  ]);
}
function rejectedError(tool) {
  return new FliskError(`flisk tool add does not add ${tool.title}. ${tool.reason}`, [
    "Use instead:",
    ...tool.instead.map((line) => `  ${line}`)
  ]);
}
function shellArg(arg) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`;
}
function commandLine(args) {
  return ["flisk", ...args].map(shellArg).join(" ");
}
function resolveWords(words) {
  for (let count = words.length; count > 0; count--) {
    const tool = findTool(words.slice(0, count).join(" "));
    if (!tool)
      continue;
    const rest = words.slice(count);
    if (rest.length > 1) {
      throw new FliskError(`"${rest.join(" ")}" is more than one resource name; ${tool.title} takes at most one.`, [`flisk tool add ${tool.id} ${rest.join("-").toLowerCase()}`]);
    }
    return { tool, name: rest[0] };
  }
  throw unknownTool(words[0] ?? "");
}
function readProject() {
  const root = findProjectRoot();
  if (!root)
    return void 0;
  const { resources } = discoverResourcesWithProblems(root);
  return { native: isNativeProject(resources), resources };
}
function checkResource(tool, name, stack, project) {
  const validation = validateResourceName(name);
  if (!validation.valid) {
    throw new FliskError(validation.error ?? `Resource name "${name}" is not valid.`, [
      `flisk tool add ${tool.id} ${tool.defaultName}-2`
    ]);
  }
  if (stack !== void 0) {
    const stackValidation = validateStackName(stack);
    if (!stackValidation.valid) {
      throw new FliskError(stackValidation.error ?? `Stack name "${stack}" is not valid.`, [
        `flisk tool add ${tool.id} ${name} --stack ${stack.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "main"}`
      ]);
    }
  }
  if (!project)
    return;
  const taken = project.resources.find((resource) => resource.name === name);
  if (taken) {
    throw new FliskError(`A resource named "${name}" already exists${taken.type ? ` (${taken.type})` : ""}, so ${tool.title} was not added.`, [
      `Add it under another name: flisk tool add ${tool.id} ${tool.id}-${name}`,
      "See the names in use with: flisk resources"
    ]);
  }
  if (stack)
    return;
  const stacks = [...new Set(project.resources.flatMap((resource) => resource.stack ?? []))].sort();
  if (stacks.length > 1) {
    throw new FliskError(`This project has ${stacks.length} stacks (${stacks.join(", ")}); say which one gets ${tool.title}.`, stacks.map((each) => `flisk tool add ${tool.id} ${name} --stack ${each}`));
  }
}
function runResource(args, json, invocation = cliInvocation(), spawn = spawnSync) {
  const [command, ...prefix] = invocation;
  const result = spawn(command, [...prefix, ...args], {
    encoding: "utf8",
    stdio: json ? ["ignore", "pipe", "inherit"] : "inherit"
  });
  if (!json) {
    if (result.status !== 0) {
      throw new FliskError(`flisk ${args.slice(0, 2).join(" ")} failed.`, [
        `Run it yourself to see why: ${commandLine(args)}`
      ]);
    }
    return void 0;
  }
  const stdout = String(result.stdout ?? "").trim();
  let envelope = {};
  try {
    envelope = JSON.parse(stdout.split("\n").pop() ?? "{}");
  } catch {
  }
  if (result.status !== 0 || envelope.data === void 0 || envelope.data === null) {
    const message = envelope.errors?.[0]?.message ?? `flisk ${args.slice(0, 2).join(" ")} failed`;
    throw new FliskError(message, [`Run it yourself to see why: ${commandLine(args)}`]);
  }
  return envelope.data;
}
function addTool(words, options, run = (args, json) => runResource(args, json), project = readProject) {
  if (words.length === 0 || words.every((word) => !word.trim())) {
    throw new FliskError("Missing tool name. Choose a tool from the catalogue.", [
      "Run flisk tool list."
    ]);
  }
  const { tool, name } = resolveWords(words);
  if (name && (tool.status === "built-in" || tool.status === "manual" && !tool.defaultName)) {
    throw new FliskError(`${tool.title} takes no resource name, so "${name}" was not used.`, [
      `flisk tool add ${tool.id}`
    ]);
  }
  if (name && tool.status === "manual") {
    const validation = validateResourceName(name);
    if (!validation.valid) {
      throw new FliskError(validation.error ?? `Resource name "${name}" is not valid.`, [
        `flisk tool add ${tool.id} ${tool.defaultName}`
      ]);
    }
  }
  const described = describeTool(tool, { name, stack: options.stack });
  switch (tool.status) {
    case "rejected":
      throw rejectedError(tool);
    case "built-in":
      if (!options.json)
        console.log(`${source_default.green("\u2713")} ${tool.title}: ${tool.note}`);
      return described;
    case "manual":
      if (!options.json) {
        console.log(`${source_default.yellow("!")} ${tool.title}: ${tool.reason}`);
        console.log("");
        manualSteps(tool, name).forEach((step, index) => {
          console.log(`  ${index + 1}. ${step}`);
        });
      }
      return described;
    case "resource": {
      const view = project();
      if (!view) {
        const error = errorFactories.notInProject();
        error.suggestions.push(`Then run: flisk tool add ${tool.id}${name ? ` ${name}` : ""}`);
        throw error;
      }
      checkResource(tool, name ?? tool.defaultName, options.stack, view);
      const args = resourceArgs(tool, {
        name,
        stack: options.stack,
        dryRun: options.dryRun,
        json: options.json,
        local: view.native && (tool.group === "backend" || tool.group === "frontend")
      });
      if (!options.json)
        console.log(source_default.gray(`$ flisk ${args.join(" ")}`));
      const resource = run(args, Boolean(options.json));
      if (!options.json && tool.next)
        console.log(`
Next: ${tool.next}`);
      return {
        ...described,
        command: ["flisk", ...args].join(" "),
        ...options.json ? { resource } : {}
      };
    }
  }
}
var toolAddCommand = addYesOption(new Command("add")).description("Add a tool by name (react, postgresql, fastapi, rag\u2026); cloud providers are rejected").argument("[tool-and-name...]", "The tool (one or more words, for example react or spring boot), then an optional resource name (default per tool: web, server, db\u2026); use flisk tool list to browse the catalogue").option("-s, --stack <stack>", "Stack to assign the resource to (default: as flisk resource picks it)").option("--dry-run", "Preview the resource without writing files or reserving a port", false).option("--json", "Print one JSON envelope on stdout; implies --yes", false).addHelpText("after", "\nExamples:\n  flisk tool list\n  flisk tool add react\n  flisk tool add postgresql\n  flisk tool add fastapi orders-api --stack shop\n  flisk tool add spring boot\n  flisk tool add rag --dry-run").action(async (words, options) => {
  if (words.length === 0 || words.every((word) => !word.trim())) {
    const message = "Missing tool name. Choose a tool from the catalogue.";
    if (options.json) {
      console.log(JSON.stringify(createMachineEnvelope(listTools({ json: true }), [
        { code: "TOOL_NAME_REQUIRED", message }
      ])));
    } else {
      console.error(message);
      listTools({});
    }
    process.exitCode = 1;
    return;
  }
  if (options.json) {
    await runJsonCommand("TOOL_ADD_FAILED", "flisk tool add", async () => ({
      data: addTool(words, options)
    }));
    return;
  }
  await runCommand(async () => {
    addTool(words, options);
  });
});
var toolListCommand = new Command("list").description("List every tool in the catalogue").option("--json", "Print one JSON envelope on stdout", false).addHelpText("after", "\nExamples:\n  flisk tool list\n  flisk tool list --json").action(async (options) => {
  if (options.json) {
    await runJsonCommand("TOOL_LIST_FAILED", "flisk tool list", async () => ({
      data: listTools(options)
    }));
    return;
  }
  await runCommand(async () => {
    listTools(options);
  });
});
var toolCommand = new Command("tool").description("Add or list tools by name: flisk tool add react, postgresql, fastapi, rag (cloud is rejected); list with flisk tool list").addCommand(toolListCommand).addCommand(toolAddCommand).addHelpText("after", "\nExamples:\n  flisk tool list\n  flisk tool add\n  flisk tool add react");

export {
  listTools,
  formatToolList,
  describeTool,
  resolveWords,
  checkResource,
  runResource,
  addTool,
  toolCommand
};
