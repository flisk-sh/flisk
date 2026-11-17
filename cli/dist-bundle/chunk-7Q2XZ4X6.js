import{createRequire as __fliskRequire}from'node:module';const require=__fliskRequire(import.meta.url);
import {
  BACKEND_FRAMEWORKS,
  FRONTEND_FRAMEWORKS
} from "./chunk-2FFXENNE.js";
import {
  PROJECT_TEMPLATES
} from "./chunk-4CRSIAQJ.js";
import {
  BACKEND_LANGUAGES
} from "./chunk-2ZNKJUYM.js";
import {
  DATABASE_FRAMEWORKS,
  PRESET_RESOURCE_TYPES,
  RESOURCE_CREATE_TYPE_VALUES
} from "./chunk-U3566SRZ.js";
import {
  VALID_RESOURCE_TYPES,
  showError,
  source_default
} from "./chunk-73W4Y4TI.js";

// dist/commands/completion.js
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { Command } from "commander";

// dist/commands/completion-shells.js
var SUPPORTED_SHELLS = ["bash", "zsh", "fish", "powershell"];

// dist/commands/completion-candidates.js
var POSITIONALS = {
  help: "commands",
  up: "stacks-and-resources",
  stack: "stacks",
  restart: "resources",
  logs: "resources",
  "agent sessions": "resources"
};
var COMMAND_VALUES = {
  resources: { "--type": [...VALID_RESOURCE_TYPES] },
  completion: { "--shell": [...SUPPORTED_SHELLS] },
  doctor: { "--scope": ["project", "machine"] },
  create: {
    "--runtime": ["local", "docker"],
    "--starter": Object.keys(PROJECT_TEMPLATES)
  }
};
var TYPE_VALUES = {
  "--framework": {
    byType: {
      frontend: Object.keys(FRONTEND_FRAMEWORKS),
      backend: Object.keys(BACKEND_FRAMEWORKS),
      database: [...DATABASE_FRAMEWORKS],
      ...Object.fromEntries(Object.entries(PRESET_RESOURCE_TYPES).map(([type, { frameworks }]) => [
        type,
        [...frameworks]
      ]))
    },
    // `flisk resource` creates a backend unless the user asks for another type.
    fallback: Object.keys(BACKEND_FRAMEWORKS)
  },
  "--language": {
    byType: { backend: Object.keys(BACKEND_LANGUAGES) },
    fallback: Object.keys(BACKEND_LANGUAGES)
  }
};
function toOptions(options) {
  return options.filter((option) => typeof option.long === "string").map((option) => ({
    flag: option.long,
    description: option.description,
    takesValue: option.required || option.optional
  }));
}
function helpCommandOf(program) {
  const internals = program;
  const help = internals._getHelpCommand?.();
  if (!help)
    return void 0;
  const helpOption = internals._getHelpOption?.();
  return {
    name: help.name(),
    aliases: help.aliases(),
    description: help.description(),
    options: helpOption ? toOptions([helpOption]) : [],
    subcommands: [],
    positional: "commands"
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
    ...POSITIONALS[path] ? { positional: POSITIONALS[path] } : {},
    ...argument ? { argument: argument.name() } : {},
    ...argument?.variadic ? { variadic: true } : {},
    ...optionValues ? { optionValues } : {}
  };
}
function buildCompletionCandidates(program) {
  const help = helpCommandOf(program);
  const helpOption = program._getHelpOption?.();
  return {
    commands: [
      ...help ? [help] : [],
      ...program.commands.map((command) => toCompletionCommand(command, command.name()))
    ],
    globalOptions: [...toOptions(program.options), ...helpOption ? toOptions([helpOption]) : []],
    values: {
      "--type": [...RESOURCE_CREATE_TYPE_VALUES, "sdk"]
    },
    typeValues: TYPE_VALUES
  };
}

// dist/commands/completion.js
function toEntries(commands, parent = "") {
  return commands.map((command) => {
    const path = parent ? `${parent} ${command.name}` : command.name;
    return {
      path,
      name: command.name,
      aliases: command.aliases,
      description: command.description,
      options: command.options,
      subcommands: toEntries(command.subcommands, path),
      parent,
      ...command.positional ? { positional: command.positional } : {},
      ...command.argument ? { argument: command.argument } : {},
      ...command.variadic ? { variadic: true } : {},
      ...command.optionValues ? { optionValues: command.optionValues } : {}
    };
  });
}
function flatten(entries) {
  return entries.flatMap((entry) => [entry, ...flatten(entry.subcommands)]);
}
function commandWords(entries) {
  return entries.flatMap((entry) => [entry.name, ...entry.aliases]);
}
function shortDescription(description) {
  const text = description.replace(/[[\]'":]/g, "").trim();
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
function flagList(options) {
  return options.map((option) => option.flag).join(" ");
}
function valuesOf(flag, candidates, entry) {
  return entry?.optionValues?.[flag] ?? candidates.values[flag];
}
function typeValueArms(values) {
  const arms = Object.entries(values.byType).map(([type, list]) => ({
    types: [type],
    values: [...list]
  }));
  if (values.fallback.length === 0)
    return arms;
  const same = arms.find((arm) => arm.values.join(" ") === values.fallback.join(" "));
  if (same) {
    same.types.push("");
  } else {
    arms.push({ types: [""], values: [...values.fallback] });
  }
  return arms;
}
function shellTypeCondition(types) {
  const parts = types.filter((type) => type !== "").map((type) => `"$${TYPE_VARIABLE}" = "${type}"`);
  if (types.includes(""))
    parts.push(`-z "\${${TYPE_VARIABLE}}"`);
  return parts.join(" || ");
}
var TYPE_VARIABLE = "flisk_type";
var BASH_STACKS = `flisk stacks --json 2>/dev/null | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"$//'`;
var BASH_RESOURCES = `flisk resources --json 2>/dev/null | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"$//'`;
var FISH_STACKS = `flisk stacks --json 2>/dev/null | string match -a -r "\\"name\\":\\"[^\\"]*\\"" | string replace -r "\\"name\\":\\"([^\\"]*)\\"" "\\$1"`;
var FISH_RESOURCES = `flisk resources --json 2>/dev/null | string match -a -r "\\"name\\":\\"[^\\"]*\\"" | string replace -r "\\"name\\":\\"([^\\"]*)\\"" "\\$1"`;
var BASH_TYPE = `    ${TYPE_VARIABLE}=""
    local i
    for (( i=1; i < COMP_CWORD; i++ )); do
        if [[ "\${COMP_WORDS[i]}" = "--type" ]]; then
            ${TYPE_VARIABLE}="\${COMP_WORDS[i+1]}"
        elif [[ "\${COMP_WORDS[i]}" = "--type="* ]]; then
            ${TYPE_VARIABLE}="\${COMP_WORDS[i]#--type=}"
        fi
    done`;
var ZSH_TYPE = `    local ${TYPE_VARIABLE}=""
    local i
    for (( i = 2; i < CURRENT; i++ )); do
        if [[ "\${words[i]}" = "--type" ]]; then
            ${TYPE_VARIABLE}="\${words[i+1]}"
        elif [[ "\${words[i]}" = "--type="* ]]; then
            ${TYPE_VARIABLE}="\${words[i]#--type=}"
        fi
    done`;
var FISH_TYPE = `function __flisk_resource_type
    set -l tokens (commandline -opc)
    set -l ${TYPE_VARIABLE} ""
    set -l token_count (count $tokens)
    for i in (seq $token_count)
        if test "$tokens[$i]" = "--type"
            if test $i -lt $token_count
                set next_index (math $i + 1)
                set ${TYPE_VARIABLE} "$tokens[$next_index]"
            end
        else if string match -q -- "--type=*" "$tokens[$i]"
            set ${TYPE_VARIABLE} (string replace -- "--type=" "" "$tokens[$i]")
        end
    end
    echo $${TYPE_VARIABLE}
end`;
var POWERSHELL_TYPE = `  $${TYPE_VARIABLE} = ''
  for ($i = 0; $i -lt $typed.Count; $i++) {
    if ($typed[$i] -eq '--type' -and ($i + 1) -lt $typed.Count) { $${TYPE_VARIABLE} = $typed[$i + 1] }
    elseif ($typed[$i] -like '--type=*') { $${TYPE_VARIABLE} = $typed[$i].Substring(7) }
  }`;
function bashTypeValues(values) {
  const lines = [`            local ${TYPE_VARIABLE}_values=""`];
  typeValueArms(values).forEach((arm, index) => {
    lines.push(`            ${index === 0 ? "if" : "elif"} [[ ${shellTypeCondition(arm.types)} ]]; then`);
    lines.push(`                ${TYPE_VARIABLE}_values="${arm.values.join(" ")}"`);
  });
  lines.push("            fi");
  lines.push(`            COMPREPLY=( $(compgen -W "\${${TYPE_VARIABLE}_values}" -- \${cur}) )`);
  return lines.join("\n");
}
function zshTypeValues(flag, values) {
  const lines = [
    `    local -a ${TYPE_VARIABLE}_values`,
    `    if [[ ${shellTypeCondition(typeValueArms(values)[0].types)} ]]; then`,
    `        ${TYPE_VARIABLE}_values=(${typeValueArms(values)[0].values.join(" ")})`
  ];
  for (const arm of typeValueArms(values).slice(1)) {
    lines.push(`    elif [[ ${shellTypeCondition(arm.types)} ]]; then`);
    lines.push(`        ${TYPE_VARIABLE}_values=(${arm.values.join(" ")})`);
  }
  lines.push("    fi");
  lines.push(`    (( $#${TYPE_VARIABLE}_values )) && _describe -t values '${flag.slice(2)}' ${TYPE_VARIABLE}_values`);
  return lines.join("\n");
}
function fishTypeValues(values) {
  const lines = ["    switch (__flisk_resource_type)"];
  for (const arm of typeValueArms(values)) {
    lines.push(`        case ${arm.types.map((type) => type === "" ? "''" : type).join(" ")}`);
    lines.push(`            printf '%s\\n' ${arm.values.join(" ")}`);
  }
  lines.push("    end");
  return lines.join("\n");
}
function powershellTypeValues(flag, values) {
  const arms = typeValueArms(values);
  const lines = [`  if ($previous -eq '${flag}') {`, "    $values = @()"];
  arms.forEach((arm, index) => {
    const conditions = arm.types.filter((type) => type !== "").map((type) => `$${TYPE_VARIABLE} -eq '${type}'`);
    if (arm.types.includes(""))
      conditions.push(`$${TYPE_VARIABLE} -eq ''`);
    lines.push(`    ${index === 0 ? "if" : "elseif"} (${conditions.join(" -or ")}) { $values = @(${arm.values.map((value) => `'${value}'`).join(", ")}) }`);
  });
  lines.push('    return $values | Where-Object { $_ -like "$wordToComplete*" }');
  lines.push("  }");
  return lines.join("\n");
}
function renderBash(candidates) {
  const entries = toEntries(candidates.commands);
  const words = commandWords(entries);
  const globalFlags = flagList(candidates.globalOptions);
  const aliasCases = entries.flatMap((entry) => entry.aliases.map((alias) => `        ${alias}) cmd="${entry.name}" ;;`)).join("\n");
  const commandCases = entries.filter((entry) => entry.options.length > 0).map((entry) => `            ${entry.name}) options="${flagList(entry.options)}" ;;`).join("\n");
  const subCommandOptionCases = flatten(entries).filter((entry) => entry.parent !== "" && entry.options.length > 0).map((entry) => `                "${entry.path}") options="${flagList(entry.options)}" ;;`).join("\n");
  const commandValueCases = flatten(entries).flatMap((entry) => Object.entries(entry.optionValues ?? {}).map(([flag, values]) => `        "${entry.path} ${flag}")
            COMPREPLY=( $(compgen -W "${values.join(" ")}" -- \${cur}) )
            return 0
            ;;`)).join("\n");
  const valueCases = Object.entries(candidates.values).map(([flag, values]) => `        ${flag})
            COMPREPLY=( $(compgen -W "${values.join(" ")}" -- \${cur}) )
            return 0
            ;;`).join("\n");
  const typeValueCases = Object.entries(candidates.typeValues).map(([flag, values]) => `        ${flag})
${bashTypeValues(values)}
            return 0
            ;;`).join("\n");
  const subCommandCases = entries.filter((entry) => entry.subcommands.length > 0).map((entry) => `        ${entry.name}) words="${commandWords(entry.subcommands).join(" ")}" ;;`).join("\n");
  const positionalCases = entries.filter((entry) => entry.positional).map((entry) => {
    switch (entry.positional) {
      case "stacks":
        return `        ${entry.name}) words="\${stacks}" ;;`;
      case "resources":
        return `        ${entry.name}) words="\${resources}" ;;`;
      case "stacks-and-resources":
        return `        ${entry.name}) words="\${stacks} \${resources}" ;;`;
      case "commands":
        return `        ${entry.name}) words="\${commands}" ;;`;
      default:
        return "";
    }
  }).join("\n");
  const subCommandPositionalCases = flatten(entries).filter((entry) => entry.parent !== "" && entry.positional).map((entry) => {
    switch (entry.positional) {
      case "stacks":
        return `            "${entry.path}") words="\${stacks}" ;;`;
      case "resources":
        return `            "${entry.path}") words="\${resources}" ;;`;
      case "stacks-and-resources":
        return `            "${entry.path}") words="\${stacks} \${resources}" ;;`;
      case "commands":
        return `            "${entry.path}") words="\${commands}" ;;`;
      default:
        return "";
    }
  }).join("\n");
  const subCommandPathCases = flatten(entries).filter((entry) => entry.parent !== "").map((entry) => `            "${entry.path}") path="${entry.path}" ;;`).join("\n");
  return `# Flisk CLI Bash Completion
# Generated by "flisk completion bash". The command and flag lists come from the CLI itself.
_flisk_completions() {
    local cur prev cmd sub options words commands stacks resources path ${TYPE_VARIABLE} ${TYPE_VARIABLE}_values
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    cmd="\${COMP_WORDS[1]}"
    sub="\${COMP_WORDS[2]}"

    # The path of the command the cursor is in, for example "config verify".
    path="\${cmd}"
    case "\${cmd} \${sub}" in
${subCommandPathCases}
    esac

    commands="${words.join(" ")}"

    # The stacks and the resources of the current project.
    stacks="$(${BASH_STACKS})"
    resources="$(${BASH_RESOURCES})"

${BASH_TYPE}

    # The values of the flags of the current command, when the command accepts its own set.
    case "\${path} \${prev}" in
${commandValueCases}
    esac

    # The values of the flags that take a fixed list.
    case "\${prev}" in
${valueCases}
${typeValueCases}
        --stack)
            COMPREPLY=( $(compgen -W "\${stacks}" -- \${cur}) )
            return 0
            ;;
        --only)
            COMPREPLY=( $(compgen -W "\${resources}" -- \${cur}) )
            return 0
            ;;
    esac

    # The aliases are the same commands under a different name.
    case "\${cmd}" in
${aliasCases}
    esac

    # The flags of the current command.
    if [[ \${cur} == -* ]]; then
        options="${globalFlags}"
        case "\${cmd}" in
${commandCases}
        esac
        if [[ -n "\${sub}" ]]; then
            case "\${cmd} \${sub}" in
${subCommandOptionCases}
            esac
        fi
        COMPREPLY=( $(compgen -W "\${options}" -- \${cur}) )
        return 0
    fi

    # Inside a sub-command the flags and the positional argument of the sub-command are left.
    if [[ -n "\${sub}" ]]; then
        words=""
        case "\${cmd} \${sub}" in
${subCommandPositionalCases}
        esac
        if [[ -n "\${words}" ]]; then
            COMPREPLY=( $(compgen -W "\${words}" -- \${cur}) )
        fi
        return 0
    fi

    words="\${commands}"
    case "\${cmd}" in
${subCommandCases}
${positionalCases}
    esac

    COMPREPLY=( $(compgen -W "\${words}" -- \${cur}) )
    return 0
}

complete -F _flisk_completions flisk
`;
}
function zshPositionalSpecs(entry) {
  if (entry.subcommands.length > 0) {
    return [`'1: :_flisk_${entry.name}_subcommands'`];
  }
  switch (entry.positional) {
    case "stacks":
      return ["'1:stack:_flisk_stacks'"];
    case "resources":
      return ["'1:resource:_flisk_resources'"];
    case "stacks-and-resources":
      return ["'1:target:_flisk_stacks'"];
    case "commands":
      return ["'1:command:_flisk_commands'"];
    default:
      break;
  }
  if (entry.argument) {
    return [entry.variadic ? `'*:${entry.argument}:'` : `'1:${entry.argument}:'`];
  }
  return [];
}
function renderZsh(candidates) {
  const entries = toEntries(candidates.commands);
  const globalFlags = candidates.globalOptions.map((option) => `'${option.flag}[${shortDescription(option.description)}]'`).join(" \\\n        ");
  const commandBranches = entries.map((entry) => {
    const specs = [
      ...entry.options.map((option) => zshOptionSpec(option, candidates, entry)),
      ...zshPositionalSpecs(entry)
    ];
    if (entry.subcommands.length > 0) {
      specs.push(`'*:: :->${entry.name}_args'`);
    }
    if (specs.length === 0)
      return "";
    const words = [entry.name, ...entry.aliases].join("|");
    return `        ${words})
            _arguments \\
                ${specs.join(" \\\n                ")}
            ;;`;
  }).filter((branch) => branch !== "").join("\n");
  const subCommandStates = entries.filter((entry) => entry.subcommands.length > 0).map((entry) => {
    const branches = entry.subcommands.map((subcommand) => {
      const specs = [
        ...subcommand.options.map((option) => zshOptionSpec(option, candidates, subcommand)),
        ...zshPositionalSpecs(subcommand)
      ];
      if (specs.length === 0)
        return "";
      return `                ${subcommand.name})
                    _arguments \\
                        ${specs.join(" \\\n                        ")}
                    ;;`;
    }).filter((branch) => branch !== "").join("\n");
    return `        ${entry.name}_args)
            case "$line[1]" in
${branches}
            esac
            ;;`;
  }).join("\n");
  const commandList = entries.flatMap((entry) => [
    `        '${entry.name}:${shortDescription(entry.description)}'`,
    ...entry.aliases.map((alias) => `        '${alias}:${shortDescription(entry.description)}'`)
  ]).join("\n");
  const subCommandLists = entries.filter((entry) => entry.subcommands.length > 0).map((entry) => `_flisk_${entry.name}_subcommands() {
    local commands=(
${entry.subcommands.map((subcommand) => `        '${subcommand.name}:${shortDescription(subcommand.description)}'`).join("\n")}
    )
    _describe -t commands '${entry.name} command' commands
}`).join("\n\n");
  const typeValueFunctions = Object.entries(candidates.typeValues).map(([flag, values]) => `_flisk_${flag.slice(2)}_values() {
${ZSH_TYPE}
${zshTypeValues(flag, values)}
}`).join("\n\n");
  return `#compdef flisk

# Flisk CLI Zsh Completion
# Generated by "flisk completion zsh". The command and flag lists come from the CLI itself.

_flisk() {
    local curcontext="$curcontext" state line
    typeset -A opt_args

    _arguments -C \\
        ${globalFlags} \\
        '1: :_flisk_commands' \\
        '*:: :->args'

    case "$line[1]" in
${commandBranches}
    esac

    case "$state" in
${subCommandStates}
    esac
}

_flisk_commands() {
    local commands=(
${commandList}
    )
    _describe -t commands 'flisk command' commands
}

_flisk_stacks() {
    local stacks
    stacks=($(flisk stacks --json 2>/dev/null | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"$//'))
    _describe -t stacks 'stack' stacks
}

_flisk_resources() {
    local resources
    resources=($(flisk resources --json 2>/dev/null | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"$//'))
    _describe -t resources 'resource' resources
}

${subCommandLists}

${typeValueFunctions}

# Autoloaded from fpath, this file is the body of _flisk, so run it now to complete the first TAB.
# Sourced (\`source <(flisk completion zsh)\`), register it instead.
if [ "$funcstack[1]" = "_flisk" ]; then
    _flisk "$@"
else
    compdef _flisk flisk
fi
`;
}
function zshOptionSpec(option, candidates, entry) {
  const description = shortDescription(option.description);
  if (candidates.typeValues[option.flag]) {
    return `'${option.flag}[${description}]:${option.flag.slice(2)}:_flisk_${option.flag.slice(2)}_values'`;
  }
  const values = valuesOf(option.flag, candidates, entry);
  if (values) {
    return `'${option.flag}[${description}]:${option.flag.slice(2)}:(${values.join(" ")})'`;
  }
  if (option.flag === "--stack") {
    return `'${option.flag}[${description}]:stack:_flisk_stacks'`;
  }
  if (option.flag === "--only") {
    return `'${option.flag}[${description}]:service:_flisk_resources'`;
  }
  return option.takesValue ? `'${option.flag}[${description}]:${option.flag.slice(2)}:'` : `'${option.flag}[${description}]'`;
}
function renderFish(candidates) {
  const entries = toEntries(candidates.commands);
  const commandLines = entries.map((entry) => `complete -c flisk -f -n '__fish_use_subcommand' -a '${entry.name}' -d '${shortDescription(entry.description)}'`);
  const aliasLines = entries.flatMap((entry) => entry.aliases.map((alias) => `complete -c flisk -f -n '__fish_use_subcommand' -a '${alias}' -d '${shortDescription(entry.description)}'`));
  const subCommandLines = entries.flatMap((entry) => entry.subcommands.map((subcommand) => `complete -c flisk -f -n '__fish_seen_subcommand_from ${entry.name}' -a '${subcommand.name}' -d '${shortDescription(subcommand.description)}'`));
  const optionLines = flatten(entries).map((entry) => {
    const condition = fishCondition(entry);
    return entry.options.filter((option) => option.flag !== "--stack" && option.flag !== "--only").map((option) => {
      const args = fishValueArgument(option, candidates, entry);
      return `complete -c flisk -f -n '${condition}' -l ${option.flag.slice(2)} -d '${shortDescription(option.description)}'${args}`;
    }).join("\n");
  }).filter((line) => line !== "");
  const projectFlagLines = flatten(entries).flatMap((entry) => {
    const condition = fishCondition(entry);
    return entry.options.filter((option) => option.flag === "--stack" || option.flag === "--only").map((option) => {
      const values = option.flag === "--stack" ? `(${FISH_STACKS})` : `(${FISH_RESOURCES})`;
      return `complete -c flisk -f -n '${condition}' -l ${option.flag.slice(2)} -r -d '${shortDescription(option.description)}' -a '${values}'`;
    });
  });
  const globalLines = candidates.globalOptions.map((option) => `complete -c flisk -f -l ${option.flag.slice(2)} -d '${shortDescription(option.description)}'`);
  const stackLines = flatten(entries).filter((entry) => entry.positional === "stacks" || entry.positional === "stacks-and-resources").map((entry) => `complete -c flisk -f -n '${fishCondition(entry)}' -a '(${FISH_STACKS})'`);
  const resourceLines = flatten(entries).filter((entry) => entry.positional === "resources" || entry.positional === "stacks-and-resources").map((entry) => `complete -c flisk -f -n '${fishCondition(entry)}' -a '(${FISH_RESOURCES})'`);
  const commandNameLines = flatten(entries).filter((entry) => entry.positional === "commands").map((entry) => `complete -c flisk -f -n '${fishCondition(entry)}' -a '${commandWords(entries).join(" ")}'`);
  const typeValueFunctions = Object.entries(candidates.typeValues).map(([flag, values]) => `function __flisk_${flag.slice(2)}_values
${fishTypeValues(values)}
end`).join("\n\n");
  return `# Flisk CLI Fish Completion
# Generated by "flisk completion fish". The command and flag lists come from the CLI itself.

# Disable file completions for most commands
complete -c flisk -f

# Commands
${commandLines.join("\n")}

# Command aliases
${aliasLines.join("\n")}

# Sub-commands
${subCommandLines.join("\n")}

# Global options
${globalLines.join("\n")}

# Command options
${optionLines.join("\n")}

# Flags whose values come from the current project
${projectFlagLines.join("\n")}

# Project values
${[...stackLines, ...resourceLines, ...commandNameLines].join("\n")}

# The type of the current command line, for the flags whose values depend on it
${FISH_TYPE}

# The values of the flags that depend on the type
${typeValueFunctions}
`;
}
function fishCondition(entry) {
  return entry.parent === "" ? `__fish_seen_subcommand_from ${entry.name}` : `__fish_seen_subcommand_from ${entry.parent}; and __fish_seen_subcommand_from ${entry.name}`;
}
function fishValueArgument(option, candidates, entry) {
  if (candidates.typeValues[option.flag]) {
    return ` -r -a '(__flisk_${option.flag.slice(2)}_values)'`;
  }
  const values = valuesOf(option.flag, candidates, entry);
  return values ? ` -r -a '${values.join(" ")}'` : "";
}
function renderPowerShell(candidates) {
  const entries = toEntries(candidates.commands);
  const commandLines = entries.map((entry) => `    '${entry.name}' = '${shortDescription(entry.description)}'`);
  const aliasDescriptionLines = entries.flatMap((entry) => entry.aliases.map((alias) => `    '${alias}' = '${shortDescription(entry.description)}'`));
  const subCommandLines = entries.flatMap((entry) => entry.subcommands.map((subcommand) => `    '${entry.name} ${subcommand.name}' = '${shortDescription(subcommand.description)}'`));
  const optionLines = flatten(entries).map((entry) => {
    const flags = entry.options.map((option) => `'${option.flag}'`).join(", ");
    return `    '${entry.path}' = @(${flags})`;
  });
  const valueLines = Object.entries(candidates.values).map(([flag, values]) => `    '${flag}' = @(${values.map((value) => `'${value}'`).join(", ")})`);
  const commandValueLines = flatten(entries).flatMap((entry) => Object.entries(entry.optionValues ?? {}).map(([flag, values]) => `    '${entry.path} ${flag}' = @(${values.map((value) => `'${value}'`).join(", ")})`));
  const globalLines = candidates.globalOptions.map((option) => `'${option.flag}'`).join(", ");
  const positionalLines = flatten(entries).filter((entry) => entry.positional).map((entry) => `    '${entry.path}' = '${entry.positional}'`);
  const aliasLines = entries.flatMap((entry) => entry.aliases.map((alias) => `    '${alias}' = '${entry.name}'`));
  const typeValueBlocks = Object.entries(candidates.typeValues).map(([flag, values]) => powershellTypeValues(flag, values)).join("\n");
  return `Register-ArgumentCompleter -Native -CommandName flisk -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)

  # Generated by "flisk completion powershell". The command and flag lists come from the CLI itself.
  $commands = [ordered]@{
${commandLines.join("\n")}
${aliasDescriptionLines.join("\n")}
  }

  $aliases = [ordered]@{
${aliasLines.join("\n")}
  }

  $subcommands = [ordered]@{
${subCommandLines.join("\n")}
  }

  $commandOptions = [ordered]@{
${optionLines.join("\n")}
  }

  $optionValues = [ordered]@{
${valueLines.join("\n")}
  }

  $commandOptionValues = [ordered]@{
${commandValueLines.join("\n")}
  }

  $positional = [ordered]@{
${positionalLines.join("\n")}
  }

  $globalOptions = @(${globalLines})

  $tokens = @()
  foreach ($element in $commandAst.CommandElements) { $tokens += $element.Extent.Text }

  # The words the user already typed, without the command name.
  $typed = @()
  if ($tokens.Count -gt 1) { $typed = $tokens[1..($tokens.Count - 1)] }

  $previous = ''
  if ($typed.Count -ge 2 -and $wordToComplete -ne '') { $previous = $typed[$typed.Count - 2] }
  elseif ($typed.Count -ge 1) { $previous = $typed[$typed.Count - 1] }

  # The command path the cursor is in, for example "config verify".
  $path = @()
  foreach ($token in $typed) {
    if ($token -like '-*') { continue }
    $name = $token
    if ($aliases.Contains($name)) { $name = $aliases[$name] }
    if ($path.Count -eq 0 -and $commands.Contains($name)) { $path += $name; continue }
    if ($path.Count -eq 1 -and $subcommands.Contains(($path[0] + ' ' + $name))) { $path += $name }
  }
  $commandPath = $path -join ' '

${POWERSHELL_TYPE}

  # The value of the flag before the cursor.
  $valueKey = $commandPath + ' ' + $previous
  if ($commandOptionValues.Contains($valueKey)) {
    return $commandOptionValues[$valueKey] | Where-Object { $_ -like "$wordToComplete*" }
  }
  if ($optionValues.Contains($previous)) {
    return $optionValues[$previous] | Where-Object { $_ -like "$wordToComplete*" }
  }

${typeValueBlocks}

  # The stacks and the resources of the current project.
  $stacks = @()
  $resources = @()
  if ($previous -eq '--stack' -or $previous -eq '--only' -or $positional.Contains($commandPath)) {
    try { $stacks = (flisk stacks --json | ConvertFrom-Json).data.stacks.name } catch { }
    try { $resources = (flisk resources --json | ConvertFrom-Json).data.resources.name } catch { }
  }

  # The stacks and the resources behind the flags of the current project.
  if ($previous -eq '--stack') {
    return $stacks | Where-Object { $_ -like "$wordToComplete*" }
  }
  if ($previous -eq '--only') {
    return $resources | Where-Object { $_ -like "$wordToComplete*" }
  }

  # The flags of the current command.
  if ($wordToComplete -like '-*') {
    $flags = $globalOptions
    if ($commandPath -ne '' -and $commandOptions.Contains($commandPath)) {
      $flags = $flags + $commandOptions[$commandPath]
    }
    return $flags | Where-Object { $_ -like "$wordToComplete*" } | Sort-Object -Unique
  }

  # The sub-command names of the current command.
  if ($commandPath -ne '') {
    $names = @()
    foreach ($key in $subcommands.Keys) {
      if ($key.StartsWith($commandPath + ' ')) { $names += $key.Split(' ')[-1] }
    }
    if ($names.Count -gt 0) { return $names | Where-Object { $_ -like "$wordToComplete*" } }
  }

  # The project values of the positional argument.
  if ($positional.Contains($commandPath)) {
    switch ($positional[$commandPath]) {
      'stacks' { return $stacks | Where-Object { $_ -like "$wordToComplete*" } }
      'resources' { return $resources | Where-Object { $_ -like "$wordToComplete*" } }
      'stacks-and-resources' { return ($stacks + $resources) | Where-Object { $_ -like "$wordToComplete*" } }
      'commands' { return $commands.Keys | Where-Object { $_ -like "$wordToComplete*" } }
    }
  }

  # The command names.
  return $commands.Keys | Where-Object { $_ -like "$wordToComplete*" }
}`;
}
function renderCompletionScript(shell, candidates) {
  switch (shell) {
    case "bash":
      return renderBash(candidates);
    case "zsh":
      return renderZsh(candidates);
    case "fish":
      return renderFish(candidates);
    case "powershell":
      return renderPowerShell(candidates);
  }
}
var POWERSHELL_START = "# FLISK-CLI-COMPLETION-START";
var POWERSHELL_END = "# FLISK-CLI-COMPLETION-END";
var completionCommand = new Command("completion").argument("[shell]", "Target shell (bash, zsh, fish, powershell)").description("Generate shell completion scripts").option("-s, --shell <shell>", "Target shell (bash, zsh, fish, powershell)").option("-o, --output <path>", "Output file path (default: stdout)").option("--install", "Install completion; prints any shell configuration steps still needed").addHelpText("after", "\nExamples:\n  flisk completion zsh --install\n  flisk completion bash --install\n  flisk completion fish --install").action((shellArgument, options, command) => {
  const requestedShell = options.shell ?? shellArgument;
  const environmentShell = basename(process.env.SHELL ?? "").replace(/\.exe$/i, "").toLowerCase();
  const defaultShell = SUPPORTED_SHELLS.includes(environmentShell) ? environmentShell : "bash";
  const shell = (requestedShell ?? defaultShell).toLowerCase();
  if (requestedShell === void 0) {
    console.error(source_default.gray(`Using ${shell} completion`));
  }
  if (!SUPPORTED_SHELLS.includes(shell)) {
    showError(`Unsupported shell: ${shell}`, "Supported shells: bash, zsh, fish, powershell");
    process.exit(1);
  }
  const program = command.parent;
  if (!program) {
    console.error(source_default.red("\u274C The completion command must be registered on the flisk program."));
    process.exit(1);
  }
  const candidates = buildCompletionCandidates(program);
  const completionScript = renderCompletionScript(shell, candidates);
  const filename = shell === "bash" ? "flisk-completion.bash" : shell === "zsh" ? "_flisk" : shell === "fish" ? "flisk.fish" : "Microsoft.PowerShell_profile.ps1";
  if (options.install) {
    const home = homedir();
    let installPath;
    let installInstructions;
    switch (shell) {
      case "powershell": {
        const docs = join(home, "Documents");
        const ps7 = process.env.PSModulePath?.includes(join("Documents", "PowerShell", "Modules"));
        const profileDir = join(docs, ps7 ? "PowerShell" : "WindowsPowerShell");
        installPath = join(profileDir, filename);
        mkdirSync(profileDir, { recursive: true });
        const existing = existsSync(installPath) ? readFileSync(installPath, "utf-8") : "";
        const block = `${POWERSHELL_START}
${completionScript}
${POWERSHELL_END}`;
        const blockStart = existing.indexOf(POWERSHELL_START);
        const blockEnd = existing.indexOf(POWERSHELL_END, blockStart);
        const updated = blockStart >= 0 && blockEnd > blockStart ? existing.slice(0, blockStart) + block + existing.slice(blockEnd + POWERSHELL_END.length) : `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${block}
`;
        writeFileSync(installPath, updated, "utf-8");
        installInstructions = "\n# Close and reopen PowerShell to load the completion.";
        break;
      }
      case "bash": {
        installPath = join(home, ".bash_completion.d", filename);
        const bashDir = join(home, ".bash_completion.d");
        if (!existsSync(bashDir)) {
          mkdirSync(bashDir, { recursive: true });
        }
        installInstructions = `
# Add to ~/.bashrc:
source ~/.bash_completion.d/${filename}`;
        break;
      }
      case "zsh": {
        installPath = join(home, ".zsh", "completions", filename);
        const zshDir = join(home, ".zsh", "completions");
        if (!existsSync(zshDir)) {
          mkdirSync(zshDir, { recursive: true });
        }
        installInstructions = "\n# Add to ~/.zshrc:\nfpath+=(~/.zsh/completions)\nautoload -U compinit && compinit";
        break;
      }
      case "fish": {
        installPath = join(home, ".config", "fish", "completions", filename);
        const fishDir = join(home, ".config", "fish", "completions");
        if (!existsSync(fishDir)) {
          mkdirSync(fishDir, { recursive: true });
        }
        installInstructions = "Fish completions loaded automatically";
        break;
      }
      default:
        installPath = "";
        installInstructions = "";
    }
    if (shell !== "powershell") {
      writeFileSync(installPath, completionScript, "utf-8");
    }
    console.log(source_default.green(`\u2705 Installed ${shell} completion to:`));
    console.log(source_default.cyan(`   ${installPath}`));
    console.log(source_default.yellow(installInstructions));
  } else if (options.output) {
    writeFileSync(options.output, completionScript, "utf-8");
    console.log(source_default.green(`\u2705 Wrote ${shell} completion to:`));
    console.log(source_default.cyan(`   ${options.output}`));
    const hints = {
      bash: "# Source this file in your shell; add the source command to ~/.bashrc to load it automatically.",
      zsh: "# Put this file in a folder on $fpath as _flisk, then run: autoload -U compinit && compinit",
      fish: "# Copy this file to ~/.config/fish/completions/ as flisk.fish.",
      powershell: "# Dot-source this file in PowerShell; add the command to your $PROFILE to load it automatically."
    };
    console.log(source_default.yellow(hints[shell]));
  } else {
    console.log(completionScript);
  }
});

export {
  renderCompletionScript,
  completionCommand
};
