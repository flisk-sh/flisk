// Copyright (c) 2026 TDK Landscape contributors
// SPDX-License-Identifier: MIT
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
const BASH_COMPLETION = `# TDK CLI Bash Completion
_tdk_completions() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    
    # Main commands
    local commands="project projects stack stacks resource resources up down status ui doctor runtime version completion help upgrade mcp logs eject import config maintainers networks traefik"
    
    # Options for specific commands
    case "\${prev}" in
        runtime)
            COMPREPLY=( $(compgen -W "--check-assets --json" -- \${cur}) )
            return 0
            ;;
        tdk)
            COMPREPLY=( $(compgen -W "\${commands}" -- \${cur}) )
            return 0
            ;;
        up)
            # Complete with stack names and resource names
            local stacks=$(tdk stacks 2>/dev/null | grep '^  -' | sed 's/^  - //' | awk '{print $1}')
            local resources=$(tdk resources 2>/dev/null | grep -E '^[a-z0-9-]+' | awk '{print $1}')
            COMPREPLY=( $(compgen -W "\${stacks} \${resources}" -- \${cur}) )
            return 0
            ;;
        stack)
            # Complete with existing stack names
            local stacks=$(tdk stacks 2>/dev/null | grep '^  -' | sed 's/^  - //' | awk '{print $1}')
            COMPREPLY=( $(compgen -W "\${stacks}" -- \${cur}) )
            return 0
            ;;
        resource)
            # Suggest common resource names or types
            COMPREPLY=( $(compgen -W "api frontend backend worker --type --stack" -- \${cur}) )
            return 0
            ;;
        --type)
            COMPREPLY=( $(compgen -W "backend frontend worker mcp" -- \${cur}) )
            return 0
            ;;
        --stack)
            local stacks=$(tdk stacks 2>/dev/null | grep '^  -' | sed 's/^  - //' | awk '{print $1}')
            COMPREPLY=( $(compgen -W "\${stacks}" -- \${cur}) )
            return 0
            ;;
    esac
    
    # Global options
    if [[ \${cur} == -* ]]; then
        local options="--verbose --version --help --force --dry-run"
        COMPREPLY=( $(compgen -W "\${options}" -- \${cur}) )
        return 0
    fi
}

complete -F _tdk_completions tdk
`;
const ZSH_COMPLETION = `#compdef tdk

# TDK CLI Zsh Completion

_tdk() {
    local curcontext="$curcontext" state line
    typeset -A opt_args
    
    _arguments -C 
        '(-h --help)'{-h,--help}'[Show help]' 
        '(-v --version)'{-v,--version}'[Show version]' 
        '--verbose[Enable verbose output]' 
        '1: :_tdk_commands' 
        '*:: :->args'
    
    case "$line[1]" in
        up)
            _arguments 
                '--verbose[Enable verbose output]'
                '1: :_tdk_stacks_and_resources'
            ;;
        stack)
            _arguments 
                '--list[List resources without a stack]'
                '1: :_tdk_stacks'
            ;;
        stacks)
            _arguments 
                '--services[Include resources in each stack]'
            ;;
        resource)
            _arguments 
                '--type[Resource type]:type:(backend frontend worker mcp)' 
                '--stack[Assign to stack]:stack:_tdk_stacks' 
                '1:resource name:'
            ;;
        resources)
            _arguments 
                '--stack[Filter by stack]:stack:_tdk_stacks' 
                '--no-stack[Show unassigned only]' 
                '--ports[Show port assignments]'
            ;;
        projects)
            _arguments 
                '--check[Validate master configs]'
            ;;
        doctor)
            _arguments 
                '--fix[Attempt to fix issues]'
            ;;
        runtime)
            _arguments
                '--check-assets[Check bundled engine and template assets]'
                '--json[Print the check result as JSON]'
            ;;
        upgrade)
            _arguments
                '--force[Force upgrade even if on latest]'
                '--all[Upgrade every TDK installation found on PATH]'
                '--dry-run[Show what would be upgraded]'
            ;;
    esac
}

_tdk_commands() {
    local commands=(
        'project:Initialize project with master configs'
        'projects:Show project information'
        'stack:Organize resources into stacks'
        'stacks:List all stacks'
        'resource:Create new resource'
        'resources:List all resources'
        'up:Start services'
        'down:Stop all services'
        'status:Show resource status'
        'ui:Open interactive UI'
        'doctor:Check environment'
        'runtime:Inspect packaged runtime assets'
        'version:Show version'
        'upgrade:Upgrade TDK CLI'
        'completion:Generate shell completions'
        'mcp:Run a Model Context Protocol server over stdio for coding agents'
        'logs:Print a bounded snapshot of recent logs from the running stack'
        'eject:Take ownership of the generated Tilt and Docker files'
        'import:Import the services a directory describes (runs tdk-import)'
        'config:Manage project configuration and regenerate master files'
        'maintainers:Maintainer file checks'
        'networks:Show Traefik-routed URLs for all services'
        'traefik:Show Traefik-routed URLs for all services'
        'help:Show help'
    )
    _describe -t commands 'tdk command' commands
}

_tdk_stacks() {
    local stacks
    stacks=($(tdk stacks 2>/dev/null | grep '^  -' | sed 's/^  - //' | awk '{print $1}'))
    _describe -t stacks 'stack' stacks
}

_tdk_resources() {
    local resources
    resources=($(tdk resources 2>/dev/null | grep -E '^[a-z0-9-]+' | awk '{print $1}'))
    _describe -t resources 'resource' resources
}

_tdk_stacks_and_resources() {
    _tdk_stacks
    _tdk_resources
}

compdef _tdk tdk
`;
const FISH_COMPLETION = `# TDK CLI Fish Completion

# Disable file completions for most commands
complete -c tdk -f

# Main commands
complete -c tdk -n '__fish_use_subcommand' -a 'project' -d 'Initialize project with master configs'
complete -c tdk -n '__fish_use_subcommand' -a 'projects' -d 'Show project information'
complete -c tdk -n '__fish_use_subcommand' -a 'stack' -d 'Organize resources into stacks'
complete -c tdk -n '__fish_use_subcommand' -a 'stacks' -d 'List all stacks'
complete -c tdk -n '__fish_use_subcommand' -a 'resource' -d 'Create new resource'
complete -c tdk -n '__fish_use_subcommand' -a 'resources' -d 'List all resources'
complete -c tdk -n '__fish_use_subcommand' -a 'up' -d 'Start services'
complete -c tdk -n '__fish_use_subcommand' -a 'down' -d 'Stop all services'
complete -c tdk -n '__fish_use_subcommand' -a 'status' -d 'Show resource status'
complete -c tdk -n '__fish_use_subcommand' -a 'ui' -d 'Open interactive UI'
complete -c tdk -n '__fish_use_subcommand' -a 'doctor' -d 'Check environment'
complete -c tdk -n '__fish_use_subcommand' -a 'runtime' -d 'Inspect packaged runtime assets'
complete -c tdk -n '__fish_use_subcommand' -a 'version' -d 'Show version'
complete -c tdk -n '__fish_use_subcommand' -a 'upgrade' -d 'Upgrade TDK CLI'
complete -c tdk -n '__fish_use_subcommand' -a 'completion' -d 'Generate shell completions'
complete -c tdk -n '__fish_use_subcommand' -a 'mcp' -d 'Run a Model Context Protocol server over stdio for coding agents'
complete -c tdk -n '__fish_use_subcommand' -a 'logs' -d 'Print a bounded snapshot of recent logs from the running stack'
complete -c tdk -n '__fish_use_subcommand' -a 'eject' -d 'Take ownership of the generated Tilt and Docker files'
complete -c tdk -n '__fish_use_subcommand' -a 'import' -d 'Import the services a directory describes (runs tdk-import)'
complete -c tdk -n '__fish_use_subcommand' -a 'config' -d 'Manage project configuration and regenerate master files'
complete -c tdk -n '__fish_use_subcommand' -a 'maintainers' -d 'Maintainer file checks'
complete -c tdk -n '__fish_use_subcommand' -a 'networks' -d 'Show Traefik-routed URLs for all services'
complete -c tdk -n '__fish_use_subcommand' -a 'traefik' -d 'Show Traefik-routed URLs for all services'
complete -c tdk -n '__fish_use_subcommand' -a 'help' -d 'Show help'

# Global options
complete -c tdk -s h -l help -d 'Show help'
complete -c tdk -s v -l version -d 'Show version'
complete -c tdk -l verbose -d 'Enable verbose output'

# Command-specific completions
# resource command options
complete -c tdk -n '__fish_seen_subcommand_from resource' -l type -d 'Resource type' -a 'backend frontend worker mcp'
complete -c tdk -n '__fish_seen_subcommand_from resource' -l stack -d 'Assign to stack' -a '(tdk stacks 2>/dev/null | string match -r "^  - " | string replace "  - " "")'

# resources command options
complete -c tdk -n '__fish_seen_subcommand_from resources' -l stack -d 'Filter by stack' -a '(tdk stacks 2>/dev/null | string match -r "^  - " | string replace "  - " "")'
complete -c tdk -n '__fish_seen_subcommand_from resources' -l no-stack -d 'Show unassigned only'
complete -c tdk -n '__fish_seen_subcommand_from resources' -l ports -d 'Show port assignments'

# stack command options
complete -c tdk -n '__fish_seen_subcommand_from stack' -l list -d 'List resources without a stack'

# stacks command options
complete -c tdk -n '__fish_seen_subcommand_from stacks' -l services -d 'Include resources in each stack'

# projects command options
complete -c tdk -n '__fish_seen_subcommand_from projects' -l check -d 'Validate master configs'

# up command completions
complete -c tdk -n '__fish_seen_subcommand_from up' -a '(tdk stacks 2>/dev/null | string match -r "^  - " | string replace "  - " "")'
complete -c tdk -n '__fish_seen_subcommand_from up' -a '(tdk resources 2>/dev/null | string match -r "^[a-z0-9-]+")'

# doctor command options
complete -c tdk -n '__fish_seen_subcommand_from doctor' -l fix -d 'Attempt to fix issues'
complete -c tdk -n '__fish_seen_subcommand_from runtime' -l check-assets -d 'Check bundled engine and template assets'
complete -c tdk -n '__fish_seen_subcommand_from runtime' -l json -d 'Print the check result as JSON'

# upgrade command options
complete -c tdk -n '__fish_seen_subcommand_from upgrade' -l force -d 'Force upgrade even if on latest'
complete -c tdk -n '__fish_seen_subcommand_from upgrade' -l all -d 'Upgrade every TDK installation found on PATH'
complete -c tdk -n '__fish_seen_subcommand_from upgrade' -l dry-run -d 'Show what would be upgraded'
`;
const POWERSHELL_COMPLETION = `Register-ArgumentCompleter -Native -CommandName tdk -ScriptBlock {
  param($wordToComplete)
  $cmds = @('up','down','doctor','project','resource','stacks','status','networks','upgrade','runtime','version','ui','config')
  $cmds | Where-Object { $_ -like "$wordToComplete*" }
}`;
const POWERSHELL_START = "# TDK-CLI-COMPLETION-START";
const POWERSHELL_END = "# TDK-CLI-COMPLETION-END";
export const completionCommand = new Command("completion")
    .argument("[shell]", "Target shell (bash, zsh, fish, powershell)")
    .description("Generate shell completion scripts")
    .option("-s, --shell <shell>", "Target shell (bash, zsh, fish, powershell)")
    .option("-o, --output <path>", "Output file path (default: stdout)")
    .option("--install", "Install to shell config automatically")
    .action((shellArgument, options) => {
    const requestedShell = options.shell ?? shellArgument;
    const environmentShell = basename(process.env.SHELL ?? "")
        .replace(/\.exe$/i, "")
        .toLowerCase();
    const supportedShells = ["bash", "zsh", "fish", "powershell"];
    const defaultShell = supportedShells.includes(environmentShell) ? environmentShell : "bash";
    const shell = (requestedShell ?? defaultShell).toLowerCase();
    if (requestedShell === undefined) {
        console.error(chalk.gray(`Using ${shell} completion`));
    }
    let completionScript;
    let filename;
    switch (shell) {
        case "bash":
            completionScript = BASH_COMPLETION;
            filename = "tdk-completion.bash";
            break;
        case "zsh":
            completionScript = ZSH_COMPLETION;
            filename = "_tdk";
            break;
        case "fish":
            completionScript = FISH_COMPLETION;
            filename = "tdk.fish";
            break;
        case "powershell":
            completionScript = `${POWERSHELL_START}\n${POWERSHELL_COMPLETION}\n${POWERSHELL_END}`;
            filename = "Microsoft.PowerShell_profile.ps1";
            break;
        default:
            console.error(chalk.red(`❌ Unsupported shell: ${shell}`));
            console.log(chalk.gray("Supported shells: bash, zsh, fish, powershell"));
            process.exit(1);
    }
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
                const block = `${POWERSHELL_START}\n${POWERSHELL_COMPLETION}\n${POWERSHELL_END}`;
                const markerPattern = new RegExp(`${POWERSHELL_START}[\\s\\S]*?${POWERSHELL_END}`, "m");
                const updated = markerPattern.test(existing)
                    ? existing.replace(markerPattern, block)
                    : `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${block}\n`;
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
                installInstructions = `\n# Add to ~/.bashrc:\nsource ~/.bash_completion.d/${filename}`;
                break;
            }
            case "zsh": {
                installPath = join(home, ".zsh", "completions", filename);
                const zshDir = join(home, ".zsh", "completions");
                if (!existsSync(zshDir)) {
                    mkdirSync(zshDir, { recursive: true });
                }
                installInstructions =
                    "\n# Add to ~/.zshrc:\nfpath+=(~/.zsh/completions)\nautoload -U compinit && compinit";
                break;
            }
            case "fish": {
                installPath = join(home, ".config", "fish", "completions", filename);
                const fishDir = join(home, ".config", "fish", "completions");
                if (!existsSync(fishDir)) {
                    mkdirSync(fishDir, { recursive: true });
                }
                installInstructions = "\n# Fish completions loaded automatically";
                break;
            }
            default:
                installPath = "";
                installInstructions = "";
        }
        writeFileSync(installPath, completionScript, "utf-8");
        console.log(chalk.green(`✅ Installed ${shell} completion to:`));
        console.log(chalk.cyan(`   ${installPath}`));
        console.log(chalk.yellow(installInstructions));
    }
    else if (options.output) {
        writeFileSync(options.output, completionScript, "utf-8");
        console.log(chalk.green(`✅ Written ${shell} completion to:`));
        console.log(chalk.cyan(`   ${options.output}`));
    }
    else {
        console.log(completionScript);
    }
});
