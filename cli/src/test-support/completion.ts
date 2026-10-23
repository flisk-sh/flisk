// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import { createProgram } from "../program.js";

/**
 * Runs `flisk completion` through the root program, the way the CLI does.
 *
 * The completion command reads the commands and flags from the program it is registered on, so it
 * has to run inside that program to produce the real script.
 */
export async function runCompletionCommand(args: string[]): Promise<void> {
  const program = createProgram();
  await program.parseAsync(["node", "flisk", "completion", ...args], { from: "node" });
}
