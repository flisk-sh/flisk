// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import chalk from "chalk";
import { FliskError, showError } from "./errors.js";
import { evaluateFliskVersion } from "./flisk-version.js";
import { getPackageVersion } from "./paths.js";

export interface FliskVersionGateOptions {
  ignoreVersion?: boolean;
  json?: boolean;
  onFail?: (message: string, status: "malformed" | "too-old" | "mismatch") => void;
}

/**
 * Rejects commands when the running CLI does not satisfy the project's
 * version requirements. Use the same gate across every version-gated command.
 */
export function enforceFliskVersionGate(
  projectRoot: string,
  options: FliskVersionGateOptions = {},
  currentVersion: string = getPackageVersion(),
  exit: (code: number) => never = process.exit,
): void {
  if (options.ignoreVersion) {
    console.warn(
      chalk.yellow(
        "Warning: --ignore-version set; pinnedFliskVersion and minFliskVersion were not checked.",
      ),
    );
    return;
  }

  const result = evaluateFliskVersion(projectRoot, currentVersion);

  if (result.deprecationWarning) {
    console.warn(chalk.yellow(`Warning: ${result.deprecationWarning}`));
  }

  if (result.status === "none" || result.status === "ok") {
    return;
  }

  const message = `${result.message}\n${result.fix}`;
  options.onFail?.(message, result.status);

  if (options.json) {
    throw new FliskError(result.message, [result.fix], 1);
  }

  showError(message);
  exit(1);
}
