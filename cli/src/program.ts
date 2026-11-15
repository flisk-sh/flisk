// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * The root program.
 *
 * The commands live in `commands/registry.ts`; this module wires them into a Commander program.
 * The shell completion generator reads the same program, so the completions and the CLI can never
 * disagree about which commands and flags exist.
 */
import type { Command } from "commander";
import { getRegisteredCommands } from "./commands/registry.js";
import { createRootProgram } from "./program-root.js";

/** Builds the root program with every registered command. */
export function createProgram(): Command {
  const program = createRootProgram();
  for (const command of getRegisteredCommands()) {
    program.addCommand(command);
  }
  return program;
}
