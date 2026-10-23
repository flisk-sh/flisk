## Design Decisions

### 1. The root program is the single source of truth

`cli/src/program.ts` builds the root Commander program and adds the commands of `cli/src/commands/registry.ts`. The completion generator reads the same program: the command names and their flags come from `program.commands` and `program.options`, so a command that is not registered cannot be suggested and a registered command is always suggested.

The completion command reaches the program through `command.parent`, the Commander reference the root program sets when it adds a sub-command. `flisk completion` therefore always runs inside the program it belongs to; a detached call fails with a clear message instead of writing a script with no candidates.

### 2. The completion command does not import the registry

`cli/src/commands/registry.ts` imports the completion command, and `cli/src/commands/completion.ts` imports only `commands/completion-candidates.ts`. The candidates are read from the program the completion command is registered on, not from the registry, so there is no cycle between the two modules at all. The list of the registered commands is built inside `getRegisteredCommands()` so that a module that imports the registry does not pull the whole command tree in while it is being evaluated.

### 3. The value lists come from the registries

`--type` offers `RESOURCE_TYPE_VALUES` (`cli/src/types/index.ts`, the creatable types plus `sdk`) for `flisk resource`, which creates a resource, and `VALID_RESOURCE_TYPES` (`cli/src/utils/constants.ts`, every type a resource can have) for `flisk resources`, which filters the resources of the project. The completion offers exactly what the command accepts, so it never suggests a type the command rejects.

`--framework` and `--language` depend on the `--type` of the command line: the frontend framework ids for `--type frontend`, the backend framework ids otherwise (`flisk resource` creates a backend unless another type is asked for), and the backend language ids only for a backend. The scripts read the `--type` of the current command line, so a type that accepts neither flag offers nothing instead of a value the CLI rejects.

No script repeats a list that lives in the CLI, and a new provider is suggested as soon as it is registered.

### 4. The project values come from the machine-readable output

The stack and the resource names come from `flisk stacks --json` and `flisk resources --json`, not from the human-readable output, whose layout is not a contract. Bash and Zsh read the `"name"` fields with `grep` and `sed`, Fish with `string match` and `string replace`, and PowerShell with `ConvertFrom-Json`.

The project values are offered behind the positional arguments (`flisk up`, `flisk stack`, `flisk logs`, `flisk restart`, `flisk agent sessions`) and behind the `--stack` and `--only` flags, in all four shells.

### 5. The tests read the candidates back out of the scripts

The candidate test parses the four generated scripts and compares them with the CLI, instead of comparing the candidate data with itself. It compares the command names, the sub-command names, the flags of every command and of every sub-command, the values of the flags and the values that depend on the `--type`. A completion list that is hand-maintained again fails the test as soon as the CLI changes, which is the property the issue asks for.

### 6. Bash lists the names, the other shells list the descriptions

Bash's `compgen -W` cannot show a description next to a candidate. The three shells that can show one use the description of the command, and Bash still suggests exactly the same names and flags.

### 7. The zsh script dispatches on the command and the sub-command

The zsh script completes the first word with the command list and hands the rest to the branch of the command, which completes the sub-commands, the flags and the positional argument of the command. A command with a positional argument always gets the spec of that argument, even when there is nothing to complete for it: without the spec, zsh does not complete the value of a flag that follows the argument.
