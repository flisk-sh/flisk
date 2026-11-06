// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT

import { PROJECT_TEMPLATES } from "./project-templates.js";

/** Root options that take a value, so the value is not mistaken for a subcommand. */
const VALUE_OPTIONS = new Set(["--template", "--project"]);

export interface DemoRootOptions {
  template?: string;
  project?: string;
  keep: boolean;
  help: boolean;
  yes: boolean;
  /** Set when `--project` is present but its value cannot be a directory. */
  projectError?: string;
}

/**
 * Reads the root options of the one-command flow: `flisk <template> [options]` and
 * `flisk --template <name> [options]`. Scanning stops at the first subcommand or at `--`, so
 * `flisk run x -- tool --template=y` never starts the demo.
 */
export function parseDemoRootOptions(argv: string[]): DemoRootOptions {
  const result: DemoRootOptions = { keep: false, help: false, yes: false };
  const args = argv.slice(2);
  let index = 0;

  const first = args[0];
  if (first && !first.startsWith("-") && first in PROJECT_TEMPLATES) {
    result.template = first;
    index = 1;
  }

  for (; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined || arg === "--") break;
    if (!arg.startsWith("-")) break; // a subcommand: everything after it belongs to that command
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg : arg.slice(0, equals);
    if (name === "-h" || name === "--help") result.help = true;
    else if (name === "--keep") result.keep = true;
    else if (name === "--yes" || name === "-y") result.yes = true;
    else if (VALUE_OPTIONS.has(name)) {
      let value: string | undefined;
      if (equals !== -1) value = arg.slice(equals + 1);
      else {
        value = args[index + 1];
        // A following flag means the value is missing, not that the flag is the value.
        if (value !== undefined && !value.startsWith("-")) index += 1;
        else if (value?.startsWith("-")) value = "";
      }
      if (name === "--template") {
        if (!result.template && value) result.template = value;
      } else {
        result.project = value;
        result.projectError = projectDestinationError(value);
      }
    }
  }
  return result;
}

/** Why a `--project` value cannot be used as a directory, or undefined when it can. */
export function projectDestinationError(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") {
    return "--project needs a directory, for example --project=my-stack.";
  }
  if (value.startsWith("-")) {
    return `--project "${value}" looks like an option, not a directory.`;
  }
  if (value.includes("\0")) return "--project contains an invalid character.";
  return undefined;
}

/**
 * Ports to look at for this project's Tilt: the one set in the environment, the one a
 * previous `flisk up` saved, then the default range.
 */
export function tiltWatchPorts(
  saved: number | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): number[] {
  const configured = Number.parseInt(env.TILT_PORT ?? "", 10);
  const ports = [configured, saved ?? Number.NaN];
  for (let offset = 0; offset < 10; offset += 1) ports.push(10350 + offset);
  return [...new Set(ports.filter((port) => Number.isInteger(port) && port > 0 && port < 65536))];
}
