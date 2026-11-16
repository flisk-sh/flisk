// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
/**
 * Plain-data description of a Commander command and the runtime that turns it into a
 * lightweight program. See `command-specs.generated.ts` for the generated table.
 *
 * The CLI binary answers `--help`, `--version`, unknown-command errors and cheap argument
 * validation from this table alone. Only a command that really executes imports its module,
 * so the generator, template engine, discovery, native runtime and TUI graphs stay out of
 * `flisk <command> --help` (#4212).
 *
 * Keeping the table as data (rather than splitting every command file in two) preserves the
 * exact help text, option order, aliases, defaults and subcommand tree: the parity test in
 * `src/program.spec.test.ts` compares this program with `createProgram()` field by field.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { createRootProgram } from "../program-root.js";
import { attachNoPositionalHint, NO_POSITIONAL_HINTS } from "../utils/command-helpers.js";
import { showErrorAndExit } from "../utils/errors.js";
import { showCommandHeader } from "../utils/formatting.js";
import { findProjectRoot } from "../utils/paths.js";
import { validateResourceName } from "../utils/validation.js";
/**
 * Cheap validation of a `flisk resource <name>` argument, hoisted so a bad name fails
 * before the generator, discovery and framework modules are imported (#4212).
 *
 * The name is validated only when no earlier check in `resource.ts` could fail first:
 * no `--path`/`--resource-path`, no `--frameworks` listing, no `--base-path`, no
 * version pin in the project, and no `--json` (which prints its own envelope). In those
 * cases the real action runs unchanged and keeps its exact output and exit code.
 */
export function validateCheapArguments(spec, args, options) {
    if (spec.path.join(" ") !== "resource")
        return;
    const name = args[0];
    if (typeof name !== "string")
        return;
    if (options.path || options.resourcePath || options.frameworks || options.basePath)
        return;
    if (options.json === true || options.yes !== true)
        return;
    const validation = validateResourceName(name);
    if (validation.valid)
        return;
    // A version pin is checked before the name in resource.ts; leave that path to the real
    // action rather than reading project.json here.
    const root = findProjectRoot();
    if (root && projectHasVersionPin(root))
        return;
    // Match the real action's output: its header is printed before `assertValid`.
    showCommandHeader("Resource Creation");
    showErrorAndExit(validation.error ?? "Validation failed");
}
function projectHasVersionPin(root) {
    try {
        const text = readFileSync(join(root, ".flisk", "project.json"), "utf8");
        const config = JSON.parse(text);
        return (typeof config.pinnedFliskVersion === "string" || typeof config.minFliskVersion === "string");
    }
    catch {
        return false;
    }
}
/** Builds one Commander command from its spec. */
function buildCommand(spec, run) {
    const command = new Command(spec.name);
    command.description(spec.description);
    for (const alias of spec.aliases)
        command.alias(alias);
    if (spec.hidden)
        command._hidden = true;
    if (spec.helpOptionDisabled)
        command.helpOption(false);
    else if (spec.helpOption)
        command.helpOption(spec.helpOption.flags, spec.helpOption.description);
    if (spec.allowUnknown)
        command.allowUnknownOption();
    if (spec.passThrough)
        command.passThroughOptions();
    if (spec.positionalOptions)
        command.enablePositionalOptions();
    if (!spec.allowExcessArguments)
        command.allowExcessArguments(false);
    if (spec.showHelpAfterError)
        command.showHelpAfterError(spec.showHelpAfterError);
    if (spec.name in NO_POSITIONAL_HINTS) {
        attachNoPositionalHint(command, spec.name);
    }
    for (const option of spec.options) {
        const added = command.createOption(option.flags, option.description);
        if (option.defaultValue !== undefined) {
            added.default(option.defaultValue);
        }
        if (option.mandatory)
            added.makeOptionMandatory();
        if (option.argChoices)
            added.choices(option.argChoices);
        if (option.envVar)
            added.env(option.envVar);
        if (option.hidden)
            added.hideHelp(true);
        if (option.presetArg !== undefined)
            added.preset(option.presetArg);
        command.addOption(added);
    }
    for (const argument of spec.arguments) {
        const name = argument.required
            ? `<${argument.name}${argument.variadic ? "..." : ""}>`
            : `[${argument.name}${argument.variadic ? "..." : ""}]`;
        const built = command.createArgument(name, argument.description);
        if (argument.defaultValue !== undefined)
            built.default(argument.defaultValue);
        if (argument.argChoices)
            built.choices(argument.argChoices);
        command.addArgument(built);
    }
    for (const [position, texts] of Object.entries(spec.helpTexts)) {
        if (!["beforeAll", "before", "after", "afterAll"].includes(position))
            continue;
        for (const text of texts) {
            command.addHelpText(position, text);
        }
    }
    for (const sub of spec.subcommands)
        command.addCommand(buildCommand(sub, run));
    if (spec.hasAction) {
        // Commander passes the parsed positionals, then the options and the command itself.
        command.action(async (...actionArgs) => {
            const options = (actionArgs[spec.arguments.length] ?? {});
            validateCheapArguments(spec, actionArgs.slice(0, spec.arguments.length), options);
            await run(spec);
        });
    }
    return command;
}
/**
 * Builds the root program from plain specs. `run` is called only when Commander has accepted
 * the arguments and reached an action, never for help, version or parse errors.
 */
export function createSpecProgram(specs, run) {
    const program = createRootProgram();
    for (const spec of specs) {
        program.addCommand(buildCommand(spec, run));
    }
    return program;
}
