## MODIFIED Requirements

### Requirement: Frontend resource generation resolves and persists a registered framework provider

The CLI SHALL accept an optional `--framework <id>` for frontend resource creation. It SHALL resolve the framework through the registered providers, persist the resolved identifier as `framework` in the generated `service.json`, and select React when the option is omitted. The CLI SHALL reject an unknown identifier before writing generated files, listing the supported ids in the error, and SHALL reject `--framework` when the resource type is not frontend. Interactive prompts SHALL offer a framework picker whose default is React; non-interactive creation without `--framework` SHALL select React. A legacy `service.json` without `framework` SHALL still mean React. The Flisk runtime SHALL NOT depend on any UI framework.

#### Scenario: Omitted framework preserves React default
- **WHEN** a user creates a frontend resource without specifying a framework
- **THEN** generated `service.json` contains `"framework": "react"`
- **AND** generates the React starter files and dependencies

#### Scenario: Explicit registered framework is selected
- **WHEN** a user creates a frontend resource with a registered framework identifier
- **THEN** the CLI generates that provider's entry files, dependencies, and framework configuration
- **AND** generated `service.json` contains the selected identifier in its `framework` field
