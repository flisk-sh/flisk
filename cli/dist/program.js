import { getRegisteredCommands } from "./commands/registry.js";
import { createRootProgram } from "./program-root.js";
/** Builds the root program with every registered command. */
export function createProgram() {
    const program = createRootProgram();
    for (const command of getRegisteredCommands()) {
        program.addCommand(command);
    }
    return program;
}
