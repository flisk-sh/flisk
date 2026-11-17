import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  createDiscoveryContext
} from "./chunk-4EDXFYDP.js";
import {
  routeUsageErrorsToJson
} from "./chunk-MJGDAK6E.js";
import {
  createMachineEnvelope,
  writeMachineError
} from "./chunk-3SNMUNQF.js";
import {
  skippedServiceFiles,
  stackExists
} from "./chunk-2BH5UW2N.js";
import {
  includes
} from "./chunk-UPCGXTMS.js";
import {
  formatCount,
  showAllSatisfyCondition,
  showDetail,
  showEmptyState,
  showStep
} from "./chunk-ARPSTQFE.js";
import {
  FliskError,
  VALID_RESOURCE_TYPES,
  errorFactories,
  findProjectRoot,
  requireProjectRoot,
  runCommand,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/resources.js
import { Command, Option } from "commander";
async function runResourcesList(options) {
  const action = async () => {
    if (options.json) {
      if (!findProjectRoot()) {
        writeMachineError(errorFactories.notInProject());
      }
    } else {
      requireProjectRoot();
    }
    if (options.type !== void 0 && !includes(VALID_RESOURCE_TYPES, options.type)) {
      throw new FliskError(`Invalid resource type "${options.type}"`, [
        options.type === "queue" || options.type === "inference" ? `Resources created with --type ${options.type} are saved as bring-your-own resources: flisk resources --type bring-your-own` : `Valid types: ${VALID_RESOURCE_TYPES.join(", ")}`
      ]);
    }
    const discovery = createDiscoveryContext();
    if (typeof options.stack === "string" && !stackExists(options.stack, discovery.resources)) {
      const error = errorFactories.stackNotFound(options.stack, discovery.stackNames);
      if (options.json)
        writeMachineError(error);
      error.exit();
    }
    const withoutStackFilter = options.noStack || options.stack === false;
    const stackName = typeof options.stack === "string" ? options.stack : void 0;
    let resources = discovery.resources;
    if (stackName) {
      resources = discovery.resourcesByStack.get(stackName) || [];
      if (resources.length === 0 && !options.json && options.type === void 0) {
        showEmptyState("stack-services", ` in stack "${stackName}"`);
        return;
      }
    }
    if (withoutStackFilter) {
      resources = discovery.unassignedResources;
      if (resources.length === 0 && !options.json && options.type === void 0) {
        showAllSatisfyCondition("resources", "assigned to a stack");
        return;
      }
    }
    if (options.type !== void 0) {
      resources = resources.filter((resource) => (resource.config?.appType ?? resource.type) === options.type);
    }
    if (options.json) {
      const data = resources.map((resource) => ({
        name: resource.name,
        stack: resource.stack ?? null,
        type: resource.config?.appType ?? resource.type ?? "unknown",
        port: resource.port ?? null,
        path: resource.configPath
      }));
      console.log(JSON.stringify(createMachineEnvelope({ resources: data, ...skippedServiceFiles(discovery.problems) })));
      return;
    }
    if (resources.length === 0) {
      const stackContext = stackName ? ` in stack "${stackName}"` : "";
      const noStackContext = withoutStackFilter && !stackName ? " without a stack" : "";
      const typeContext = options.type !== void 0 ? ` with type "${options.type}"` : "";
      showEmptyState(stackName ? "stack-services" : "resources", stackContext + noStackContext + typeContext);
      return;
    }
    showStep(`Found ${formatCount(resources.length, "resource")}:
`);
    if (options.verbose || options.ports) {
      for (const resource of resources) {
        console.log(source_default.bold(`${resource.name}`));
        if (resource.stack) {
          console.log(source_default.gray(`  Stack: ${resource.stack}`));
        } else {
          console.log(source_default.yellow(`  Stack: (not assigned)`));
        }
        if (options.ports && resource.port) {
          console.log(source_default.gray(`  Port: ${resource.port}`));
        }
        if (options.verbose) {
          console.log(source_default.gray(`  Type: ${resource.type || "unknown"}`));
          console.log(source_default.gray(`  Path: ${resource.configPath}`));
        }
        console.log();
      }
    } else {
      for (const resource of resources) {
        const stackInfo = resource.stack ? source_default.gray(` [${resource.stack}]`) : source_default.yellow(" [no stack]");
        console.log(`  ${resource.name}${stackInfo}`);
      }
      showDetail("\nRun with --verbose for more details or --ports to see port assignments.", 0);
    }
    const withoutStackCount = stackName || options.type !== void 0 ? resources.filter((r) => !r.stack).length : discovery.unassignedResources.length;
    if (withoutStackCount > 0 && !withoutStackFilter && !stackName) {
      console.log(source_default.yellow(`
${formatCount(withoutStackCount, "resource")} not assigned to any stack.`));
      showDetail('Run "flisk resources --no-stack" to see them, or "flisk stack" to assign them.');
    }
  };
  if (options.json) {
    try {
      await action();
    } catch (error) {
      writeMachineError(error);
    }
    return;
  }
  await runCommand(action);
}
var noStackOption = new Option("--no-stack", "Show only resources without a stack").conflicts("stack");
noStackOption.negate = false;
var resourcesCommand = routeUsageErrorsToJson(new Command("resources")).description("List all resources (services) in the project").option("-v, --verbose", "Show resource details in text view (JSON output is unchanged)", false).option("-s, --stack <stack>", "Filter resources by stack name").option("-t, --type <type>", "Filter resources by type").addOption(noStackOption).option("--ports", "Show port assignments in text view (JSON output is unchanged)", false).option("--json", "Output a versioned JSON resource report", false).addHelpText("after", "\nExamples:\n  flisk resources\n  flisk resources --type database\n  flisk resources --ports").action(async (options) => {
  await runResourcesList(options);
});

export {
  runResourcesList,
  resourcesCommand
};
