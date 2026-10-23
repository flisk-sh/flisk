## ADDED Requirements

### Requirement: The framework inventory is derived from the CLI registries

The CLI SHALL derive every framework listing from the registered providers. The backend framework listing SHALL be built from the backend framework registry and the backend language registry, and the languages a framework can be combined with SHALL be decided by the same validation the resource command uses for `--framework` and `--language`. The CLI SHALL NOT keep a second, hand-maintained list of frameworks or languages.

#### Scenario: A newly registered framework is listed without a listing change
- **WHEN** a provider is added to the backend framework registry
- **THEN** `flisk resource --type backend --frameworks` lists it with its id, display name, language and command
- **AND** no listing code has to be changed

#### Scenario: A language that owns its runtime is never offered with a framework
- **WHEN** the backend listing is built
- **THEN** a language that owns its runtime (Python, Go, Rust, Node) is not listed as a language a framework can be combined with
- **AND** the listing matches what `--framework` and `--language` accept at creation time

### Requirement: The backend framework listing shows the id, the display name, and the language and runtime

`flisk resource --type backend --frameworks` SHALL print one tab separated row per registered backend framework. Each row SHALL carry the framework id, the display name, the language the service is scaffolded with (which is also the runtime it runs on), the compatibility with the requested language, and the `flisk resource` command that creates it. The compatibility cell SHALL name the language it is judged against, so it is never a bare "compatible" that could be read against a different language.

#### Scenario: The backend frameworks are listed with their language
- **WHEN** a user runs `flisk resource --type backend --frameworks`
- **THEN** every registered backend framework appears exactly once
- **AND** each row carries its id, its display name, the language it is scaffolded with, and the command that creates it

#### Scenario: The listing is copyable
- **WHEN** a user copies a row of the backend listing
- **THEN** the command in that row creates a backend resource with that framework

#### Scenario: The compatibility cell names the language
- **WHEN** a user reads a row of the backend listing
- **THEN** the compatibility cell names the language the row is judged against
- **AND** it is the default backend language when the user asked for no language

### Requirement: A requested language that a framework cannot be combined with is marked

`flisk resource --type backend --language <id> --frameworks` SHALL mark every framework that cannot be combined with the requested language, so the invalid combination is visible before a resource is created. A framework that can be combined with the requested language SHALL be marked compatible. The command of a row SHALL name the requested language, so a copied row scaffolds the language the listing was asked about instead of silently falling back to the default one. A framework that cannot be combined with the requested language SHALL be marked incompatible and its command SHALL create the resource in that language without a framework, because that language owns its runtime.

#### Scenario: A framework that owns its runtime is marked incompatible
- **WHEN** a user runs `flisk resource --type backend --language python --frameworks`
- **THEN** every framework row states that it is incompatible with `--language python`
- **AND** the command of that row creates the resource in `--language python`, without a framework

#### Scenario: A compatible language keeps the framework usable
- **WHEN** a user runs `flisk resource --type backend --language bun --frameworks`
- **THEN** every framework row states that it is compatible
- **AND** the command of that row keeps the framework and names `--language bun`

### Requirement: The frontend framework listing stays compatible

`flisk resource --frameworks` without a `--type` SHALL keep printing the frontend framework listing it printed before, with the same columns. `flisk resource --type frontend --frameworks` SHALL print the same listing. A `--language` without an explicit `--type` SHALL NOT change that listing and SHALL NOT fail, because `--language` belongs to the backend listing and to backend resources.

#### Scenario: The historical listing is unchanged
- **WHEN** a user runs `flisk resource --frameworks`
- **THEN** the output lists the registered frontend frameworks with their id, display name, kind, verification and command
- **AND** the output is the same as before this change

#### Scenario: The frontend type prints the same listing
- **WHEN** a user runs `flisk resource --type frontend --frameworks`
- **THEN** the output is the same as `flisk resource --frameworks`

#### Scenario: A language without a type keeps the frontend listing
- **WHEN** a user runs `flisk resource --language python --frameworks`
- **THEN** the command exits successfully
- **AND** the output is the same as `flisk resource --frameworks`

### Requirement: A resource type without frameworks is reported

A resource type that has no framework providers SHALL fail with an actionable message that names the types that do, instead of printing an empty listing. An unknown resource type and an unknown language SHALL keep failing with the existing errors.

#### Scenario: A type without frameworks fails
- **WHEN** a user runs `flisk resource --type worker --frameworks`
- **THEN** the command exits non-zero with a message that no frameworks are registered for that type
- **AND** the message names the types that do have frameworks

#### Scenario: An unknown type or language keeps its error
- **WHEN** a user runs `flisk resource --type not-a-type --frameworks`
- **THEN** the command exits non-zero with the unknown resource type error
- **AND** an unknown language fails with the unknown backend language error

### Requirement: The inventory is tested and documented

The CLI SHALL have automated tests for the frontend and the backend listing, including the language compatibility marker and the failing type, and the `flisk resource` help text SHALL document how to list the backend frameworks.

#### Scenario: The listings are covered by the CLI test suite
- **WHEN** the CLI test suite runs
- **THEN** the frontend listing, the backend listing, the compatibility marker, the failing type and the help text are all asserted
- **AND** a regression test pins that a `--language` without a `--type` keeps the frontend listing and exits successfully

#### Scenario: The help text points at the backend listing
- **WHEN** a user reads `flisk resource --help`
- **THEN** the `--frameworks` option states that the listing follows the resource type
- **AND** the frontend and the backend listing are both named
