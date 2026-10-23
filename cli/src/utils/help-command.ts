// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { Command } from "commander";

/**
 * `flisk help <name>` should fail for a name that is not a command or alias, like `flisk <name>` does.
 * Returns the unknown name, or undefined when the arguments are not `help <name>` or the name is known.
 */
export function unknownHelpTarget(
  args: string[],
  commands: readonly Command[],
): string | undefined {
  const [first, target] = args;
  if (first !== "help" || !target || target.startsWith("-")) return undefined;
  const known = commands.some(
    (command) => command.name() === target || command.aliases().includes(target),
  );
  return known ? undefined : target;
}
