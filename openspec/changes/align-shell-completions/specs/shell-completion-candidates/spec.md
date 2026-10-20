## ADDED Requirements

### Requirement: Completion candidates come from the CLI

`tdk completion` SHALL generate its scripts from the registered commands and the CLI registries. The candidate names, the sub-command names, the flags of every command and the value lists of `--type`, `--framework` and `--language` SHALL be read from the CLI at generation time. The generated scripts SHALL NOT repeat a hand-maintained list of commands, flags, resource types, frameworks or languages.

#### Scenario: A new command is registered

- **WHEN** a command is added to the registered commands
- **THEN** every supported shell suggests that command and its flags after the script is regenerated

#### Scenario: A new framework is registered

- **WHEN** a frontend or backend framework provider is registered
- **THEN** `--framework` suggests that framework in every supported shell

#### Scenario: The resource types change

- **WHEN** the set of resource types the CLI accepts changes
- **THEN** `--type` suggests exactly the new set of resource types in every supported shell

### Requirement: Every supported shell offers the same candidates

The Bash, Zsh, Fish and PowerShell scripts SHALL offer the same command names, the same command aliases, the same sub-command names, the same flags per command and the same values per flag. The PowerShell script SHALL suggest flags and flag values, not only command names.

#### Scenario: The four scripts are compared

- **WHEN** the four generated scripts are compared
- **THEN** they offer the same commands, the same sub-commands and the same flags

#### Scenario: A command has sub-commands

- **WHEN** a command has sub-commands
- **THEN** every supported shell suggests the names of those sub-commands after the command

### Requirement: The suggested values are the values the command accepts

The values of a flag SHALL be the values the command accepts. A command that accepts a different set of values than the default SHALL offer its own set, and a flag whose values depend on the `--type` of the command line SHALL offer the values of that type.

#### Scenario: A command filters the resources of the project

- **WHEN** the user completes the `--type` value of `tdk resources`
- **THEN** the shell suggests every type a resource can have, including the types `tdk resource` cannot create

#### Scenario: The user asks for a frontend

- **WHEN** the user completes the `--framework` value after `--type frontend`
- **THEN** the shell suggests the frontend frameworks and not the backend ones

#### Scenario: The user asks for a type that accepts no framework

- **WHEN** the user completes the `--framework` value after a type that accepts no framework
- **THEN** the shell suggests nothing, because the CLI rejects the flag for that type

### Requirement: The project values complete from the current project

The completions SHALL suggest the stacks and the resources of the current project where the shell can run the CLI. The values SHALL be read from the machine-readable output of `tdk stacks --json` and `tdk resources --json`. Every supported shell SHALL offer them behind the positional arguments of the commands that take them and behind the `--stack` and `--only` flags.

#### Scenario: A stack name is completed

- **WHEN** a user completes the `--stack` value, or the positional argument of `tdk up` or `tdk stack`
- **THEN** the shell suggests the stacks of the current project

#### Scenario: A resource name is completed

- **WHEN** a user completes the `--only` value, or the positional argument of `tdk logs`, `tdk restart` or `tdk agent sessions`
- **THEN** the shell suggests the resources of the current project

### Requirement: Stale completions fail the build

The test suite SHALL compare the candidates of the four generated scripts with the registered commands and the registries, so that a command, a sub-command, a flag or a registry entry that the completions do not offer fails the tests.

#### Scenario: A command is missing from a script

- **WHEN** a command is registered and one of the four scripts does not offer it
- **THEN** the completion candidate test fails and names the shell and the command

#### Scenario: A sub-command is missing from a script

- **WHEN** a command has sub-commands and one of the four scripts does not offer their names
- **THEN** the completion candidate test fails and names the shell and the command

### Requirement: Refreshing the installed completions is documented

The documentation SHALL explain that the completions are a copy of the CLI and SHALL give the command that refreshes the installed script after a CLI upgrade.

#### Scenario: A user upgrades the CLI

- **WHEN** a user reads the documentation after `tdk upgrade`
- **THEN** the documentation tells the user to run `tdk completion --shell <shell> --install` again
