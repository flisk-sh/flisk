import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  createDiscoveryContext
} from "./chunk-4EDXFYDP.js";
import {
  createMachineEnvelope,
  writeMachineError
} from "./chunk-3SNMUNQF.js";
import {
  skippedServiceFiles
} from "./chunk-2BH5UW2N.js";
import {
  formatCount,
  showDetail,
  showEmptyState,
  showStep
} from "./chunk-ARPSTQFE.js";
import {
  errorFactories,
  findProjectRoot,
  runCommand,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/stacks.js
import { Command } from "commander";
var stacksCommand = new Command("stacks").description("List all stacks and their resources").alias("ls").option("-v, --verbose", "Show detailed information about each stack", false).option("--services", "Include list of services in each stack", false).option("--json", "Output a versioned JSON stack report", false).addHelpText("after", "\nExamples:\n  flisk stacks\n  flisk stacks --services\n  flisk stacks --json").action(async (options) => {
  const action = async () => {
    if (options.json && !findProjectRoot()) {
      writeMachineError(errorFactories.notInProject());
    }
    const discovery = createDiscoveryContext();
    const verbose = options.verbose || stacksCommand.parent?.opts().verbose === true;
    if (options.json) {
      const stacks = discovery.stacks.map((stack) => ({
        name: stack.name,
        resourceCount: stack.resourceCount,
        ...verbose ? { description: stack.description } : {},
        ...options.services ? { services: stack.resources.map((service) => service.name) } : {}
      }));
      console.log(JSON.stringify(createMachineEnvelope({ stacks, ...skippedServiceFiles(discovery.problems) })));
      return;
    }
    if (discovery.stackNames.length === 0) {
      showEmptyState("stacks");
      return;
    }
    if (verbose || options.services) {
      showStep(`Found ${formatCount(discovery.stacks.length, "stack")}:
`);
      for (const stack of discovery.stacks) {
        console.log(source_default.bold(`${stack.name}`));
        showDetail(`${stack.description}`);
        if (verbose) {
          showDetail(formatCount(stack.resources.length, "service"));
          for (const service of stack.resources) {
            const type = service.config?.appType ?? service.type ?? "unknown";
            const port = service.port ? `  :${service.port}` : "";
            showDetail(`${service.name}  ${type}${port}`, 4);
          }
        } else if (options.services) {
          showDetail("Services:");
          for (const service of stack.resources) {
            showDetail(`${service.name}`, 4);
          }
        }
        console.log();
      }
    } else {
      showStep(`Found ${formatCount(discovery.stackNames.length, "stack")}:
`);
      for (const name of discovery.stackNames) {
        const serviceCount = discovery.resourcesByStack.get(name)?.length || 0;
        console.log(source_default.bold(`  ${name}`));
        showDetail(`${formatCount(serviceCount, "service")}`, 4);
      }
      showDetail("\nRun with --verbose for more details, or --services to see all services in each stack.", 0);
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
});

export {
  stacksCommand
};
