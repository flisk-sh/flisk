import { BACKEND_FRAMEWORKS } from "../backend-frameworks/registry.js";
import { BACKEND_LANGUAGES } from "../backend-languages/registry.js";
import { FRONTEND_FRAMEWORKS } from "../frontend-frameworks/registry.js";
import { RESOURCE_TYPE_VALUES } from "../types/index.js";
import { VALID_RESOURCE_TYPES } from "../utils/constants.js";
/**
 * The positional argument of a command, keyed by the command path (`"agent sessions"`). Only the
 * commands whose argument names something in the current project are listed.
 */
const POSITIONALS = {
    help: "commands",
    up: "stacks-and-resources",
    stack: "stacks",
    restart: "resources",
    logs: "resources",
    "agent sessions": "resources",
};
/**
 * The values of a flag, for the commands that accept another set than the default.
 *
 * `tdk resource` creates a resource and accepts the creatable types plus `sdk`
 * (`RESOURCE_TYPE_VALUES`), while `tdk resources` filters the resources of the project and accepts
 * every type a resource can have (`VALID_RESOURCE_TYPES`), which also holds `library` and
 * `migrator`. The completion offers exactly what the command accepts, so it never suggests a type
 * the command rejects.
 */
const COMMAND_VALUES = {
    resources: { "--type": [...VALID_RESOURCE_TYPES] },
};
/**
 * The values of the flags that depend on the `--type` of the command line.
 *
 * `--framework` only exists for a frontend or a backend resource, and the framework ids of the two
 * are disjoint, so the completion offers the frameworks of the type the user asked for. `--language`
 * belongs to a backend, so it offers the languages only for that type.
 */
const TYPE_VALUES = {
    "--framework": {
        byType: {
            frontend: Object.keys(FRONTEND_FRAMEWORKS),
            backend: Object.keys(BACKEND_FRAMEWORKS),
        },
        // `tdk resource` creates a backend unless the user asks for another type.
        fallback: Object.keys(BACKEND_FRAMEWORKS),
    },
    "--language": {
        byType: { backend: Object.keys(BACKEND_LANGUAGES) },
        fallback: Object.keys(BACKEND_LANGUAGES),
    },
};
function toOptions(options) {
    return options
        .filter((option) => typeof option.long === "string")
        .map((option) => ({
        flag: option.long,
        description: option.description,
        takesValue: option.required || option.optional,
    }));
}
/**
 * The help command of the program.
 *
 * Commander adds it to the program itself, so the name, the description and the aliases are the
 * ones the CLI registers. The help flag is offered as well: `tdk help --help` prints the help of
 * the program, exactly like the help flag of every other command.
 */
function helpCommandOf(program) {
    const internals = program;
    const help = internals._getHelpCommand?.();
    if (!help)
        return undefined;
    const helpOption = internals._getHelpOption?.();
    return {
        name: help.name(),
        aliases: help.aliases(),
        description: help.description(),
        options: helpOption ? toOptions([helpOption]) : [],
        subcommands: [],
        positional: "commands",
    };
}
function toCompletionCommand(command, path) {
    const optionValues = COMMAND_VALUES[path];
    const argument = command.registeredArguments[0];
    return {
        name: command.name(),
        aliases: command.aliases(),
        description: command.description(),
        options: toOptions(command.options),
        subcommands: command.commands.map((subcommand) => toCompletionCommand(subcommand, `${path} ${subcommand.name()}`)),
        ...(POSITIONALS[path] ? { positional: POSITIONALS[path] } : {}),
        ...(argument ? { argument: argument.name() } : {}),
        ...(argument?.variadic ? { variadic: true } : {}),
        ...(optionValues ? { optionValues } : {}),
    };
}
/**
 * Reads the completion candidates from the CLI: the registered commands with their flags, the
 * global flags of the root program, and the value lists of the framework, language and
 * resource-type registries.
 */
export function buildCompletionCandidates(program) {
    const help = helpCommandOf(program);
    const helpOption = program._getHelpOption?.();
    return {
        commands: [
            ...(help ? [help] : []),
            ...program.commands.map((command) => toCompletionCommand(command, command.name())),
        ],
        globalOptions: [...toOptions(program.options), ...(helpOption ? toOptions([helpOption]) : [])],
        values: {
            "--type": [...RESOURCE_TYPE_VALUES],
        },
        typeValues: TYPE_VALUES,
    };
}
