## Why

The Bash, Zsh, Fish and PowerShell completions that `tdk completion` writes were hand-maintained lists. They drifted from the CLI: the Bash script offered four resource types while the CLI knows six, no script offered the `--framework` or `--language` choices, PowerShell offered only a subset of the commands and no flags at all, and the stack-name completion looked for a `  - name` line that `tdk stacks` never prints, so it never suggested anything. A user who upgraded the CLI kept the old completion file until they reinstalled it, and a new flag or a new framework provider was missing from the completions until somebody remembered to edit four scripts.

## What Changes

- The completion candidates are generated from the CLI: the command names, the sub-command names and their flags come from the registered Commander commands, and the values of `--type`, `--framework` and `--language` come from the resource-type, frontend-framework, backend-framework and backend-language registries.
- The commands live in one list (`cli/src/commands/registry.ts`), which the root program registers and the completion generator reads through the program, so a new command cannot ship without a completion candidate.
- All four shells suggest the same commands, the same sub-commands, the same flags and the same values.
- The values a flag offers are the values the command accepts: `tdk resource --type` offers the creatable types, `tdk resources --type` offers every type of the project, and `--framework` and `--language` offer the values of the `--type` of the command line.
- The stack and resource names complete from the current project, read from the machine-readable output of `tdk stacks --json` and `tdk resources --json`, behind the positional arguments and behind the `--stack` and `--only` flags.
- The tests read the candidates back out of the four generated scripts and compare them with the CLI, so a command, a sub-command, a flag or a registry entry that the completions do not offer fails the build.
- The cheat sheet documents that the completions are a copy of the CLI and how to refresh them after an upgrade.

## Capabilities

### New Capabilities

- `shell-completion-candidates`: The CLI generates its shell completions from the registered commands and the framework, language and resource-type registries, and every supported shell offers the same candidates.

### Modified Capabilities

None.

## Impact

- Affected code: `cli/src/commands/completion.ts`, `cli/src/commands/completion-candidates.ts`, `cli/src/commands/registry.ts`, `cli/src/program.ts`, `cli/src/cli.ts`, `cli/src/types/index.ts`.
- Affected tests: `cli/src/commands/__tests__/completion*.test.ts`, `cli/src/commands/__tests__/help-lists-commands.test.ts`, `cli/src/mcp/__tests__/tools.test.ts`.
- Affected docs: `docs/cheat-sheet.md`.
- No new runtime dependency, no change to the CLI behaviour outside `tdk completion`.
